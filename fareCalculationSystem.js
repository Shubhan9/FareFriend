// FareFriend - Fare Recalculation System

// 1. Enhanced data structure for storing trip information
class TripData {
    constructor(pickupLocation, dropoffLocation, estimatedDistance, estimatedTime, 
                estimatedFare, actualFare = null, reportedIssues = [], timestamp) {
        this.pickupLocation = pickupLocation;
        this.dropoffLocation = dropoffLocation;
        this.estimatedDistance = estimatedDistance;
        this.estimatedTime = estimatedTime;
        this.estimatedFare = estimatedFare;
        this.fareBreakdown = {
            baseFare: 0,
            distanceCharge: 0,
            nightCharge: 0,
            waitingCharge: 0
        };
        this.actualFare = actualFare;
        this.reportedIssues = reportedIssues;
        this.timestamp = timestamp;
        this.timeOfDay = this.getTimeCategory();
        this.dayOfWeek = new Date(timestamp).getDay();
        this.discrepancy = this.calculateDiscrepancy();
    }

    getTimeCategory() {
        const hour = new Date(this.timestamp).getHours();
        if (hour >= 0 && hour < 5) return 'night';
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }

    calculateDiscrepancy() {
        if (this.actualFare === null) return null;
        return this.actualFare - this.estimatedFare;
    }

    setFareBreakdown(baseFare, distanceCharge, nightCharge, waitingCharge) {
        this.fareBreakdown = {
            baseFare,
            distanceCharge,
            nightCharge,
            waitingCharge
        };
    }
}

// 2. Database handler for storing and retrieving trip data
class TripDatabase {
    constructor() {
        this.trips = [];
        this.loadFromLocalStorage();
    }

    loadFromLocalStorage() {
        const storedTrips = localStorage.getItem('fareTrips');
        if (storedTrips) {
            try {
                const rawTrips = JSON.parse(storedTrips);
                this.trips = rawTrips.map(trip => {
                    const tripData = new TripData(
                        trip.pickupLocation,
                        trip.dropoffLocation,
                        trip.estimatedDistance,
                        trip.estimatedTime,
                        trip.estimatedFare,
                        trip.actualFare,
                        trip.reportedIssues || [],
                        trip.timestamp
                    );
                    if (trip.fareBreakdown) {
                        tripData.setFareBreakdown(
                            trip.fareBreakdown.baseFare || 0,
                            trip.fareBreakdown.distanceCharge || 0,
                            trip.fareBreakdown.nightCharge || 0,
                            trip.fareBreakdown.waitingCharge || 0
                        );
                    }
                    return tripData;
                });
                console.log("Loaded trips from storage:", this.trips.length);
            } catch (error) {
                console.error("Error loading trips:", error);
                this.trips = [];
            }
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('fareTrips', JSON.stringify(this.trips));
    }

    addTrip(trip) {
        console.log("Saving trip report:", trip);
        this.trips.push(trip);
        this.saveToLocalStorage();
        console.log("Current trip database:", this.getTrips());
    }

    updateTrip(tripId, actualFare, reportedIssues, comments) {
        if (this.trips[tripId]) {
            this.trips[tripId].actualFare = actualFare;
            this.trips[tripId].reportedIssues = reportedIssues;
            this.trips[tripId].comments = comments;
            this.trips[tripId].discrepancy = this.trips[tripId].calculateDiscrepancy();
            this.saveToLocalStorage();
        }
    }

    getTrips() {
        return this.trips;
    }

    getTripsWithReportedFares() {
        return this.trips.filter(trip => trip.actualFare !== null);
    }

    getTripsForRoute(pickup, dropoff, threshold = 0.5) {
        const result = this.trips.filter(trip => {
            // Simple string comparison first for exact matches
            if (trip.pickupLocation === pickup.name && trip.dropoffLocation === dropoff.name) {
                return true;
            }
            
            // Otherwise try distance-based matching if coordinates are available
            if (pickup.lat && pickup.lon && dropoff.lat && dropoff.lon) {
                try {
                    const pickupCoords = { lat: pickup.lat, lon: pickup.lon };
                    const dropoffCoords = { lat: dropoff.lat, lon: dropoff.lon };
                    
                    const pickupDistance = calculateLocationDistance(trip.pickupLocation, pickupCoords);
                    const dropoffDistance = calculateLocationDistance(trip.dropoffLocation, dropoffCoords);
                    
                    return pickupDistance < threshold && dropoffDistance < threshold;
                } catch (error) {
                    // Fall back to string comparison if coordinate comparison fails
                    return false;
                }
            }
            
            return false;
        });
        
        console.log(`Found ${result.length} trips for route ${pickup.name} -> ${dropoff.name}`);
        return result;
    }
}

// 3. Fare calculation engine with learning capabilities
class FareCalculator {
    constructor() {
        this.baseRate = FARE_CONSTANTS.BASE_FARE;
        this.perKmRate = FARE_CONSTANTS.PER_KM_RATE;
        this.waitingChargePerMin = FARE_CONSTANTS.WAITING_CHARGE_PER_MIN;
        this.nightMultiplier = FARE_CONSTANTS.NIGHT_CHARGE_MULTIPLIER;
        this.minimumFare = FARE_CONSTANTS.BASE_FARE;
        
        this.adjustmentFactors = {
            timeOfDay: {
                morning: 1.0,
                afternoon: 1.0,
                evening: 1.1,
                night: 1.25
            },
            dayOfWeek: [1.0, 1.0, 1.0, 1.0, 1.0, 1.15, 1.15], // Sun to Sat
            trafficConditions: {
                low: 1.0,
                medium: 1.1,
                high: 1.2
            }
        };
        
        this.tripDatabase = new TripDatabase();
        this.updateAdjustmentFactors();
    }

    updateAdjustmentFactors() {
        const reportedTrips = this.tripDatabase.getTripsWithReportedFares();
        if (reportedTrips.length < 3) return;

        const timeDiscrepancies = {
            morning: { sum: 0, count: 0 },
            afternoon: { sum: 0, count: 0 },
            evening: { sum: 0, count: 0 },
            night: { sum: 0, count: 0 }
        };
        
        const dayDiscrepancies = Array(7).fill().map(() => ({ sum: 0, count: 0 }));

        reportedTrips.forEach(trip => {
            if (trip.discrepancy !== null) {
                const timeCategory = trip.timeOfDay;
                timeDiscrepancies[timeCategory].sum += trip.discrepancy;
                timeDiscrepancies[timeCategory].count++;
                
                const dayIndex = trip.dayOfWeek;
                dayDiscrepancies[dayIndex].sum += trip.discrepancy;
                dayDiscrepancies[dayIndex].count++;
            }
        });

        for (const [time, data] of Object.entries(timeDiscrepancies)) {
            if (data.count > 0) {
                const avgDiscrepancy = data.sum / data.count;
                const discrepancyRatio = avgDiscrepancy / this.baseRate;
                const newFactor = Math.max(0.5, Math.min(2.0, this.adjustmentFactors.timeOfDay[time] + discrepancyRatio));
                this.adjustmentFactors.timeOfDay[time] = parseFloat(newFactor.toFixed(2));
            }
        }

        for (let i = 0; i < 7; i++) {
            if (dayDiscrepancies[i].count > 0) {
                const avgDiscrepancy = dayDiscrepancies[i].sum / dayDiscrepancies[i].count;
                const discrepancyRatio = avgDiscrepancy / this.baseRate;
                const newFactor = Math.max(0.5, Math.min(2.0, this.adjustmentFactors.dayOfWeek[i] + discrepancyRatio));
                this.adjustmentFactors.dayOfWeek[i] = parseFloat(newFactor.toFixed(2));
            }
        }

        localStorage.setItem('fareAdjustmentFactors', JSON.stringify(this.adjustmentFactors));
    }

    loadAdjustmentFactors() {
        const storedFactors = localStorage.getItem('fareAdjustmentFactors');
        if (storedFactors) {
            this.adjustmentFactors = JSON.parse(storedFactors);
        }
    }

    calculateFare(distance, time, waitingTime = 0, isNight = false) {
        let baseFare = this.baseRate;
        // Only charge for distance beyond the minimum distance
        let chargeableDistance = Math.max(0, distance - FARE_CONSTANTS.MIN_DISTANCE);
        let distanceCharge = chargeableDistance * this.perKmRate;
        let nightCharge = isNight ? (baseFare + distanceCharge) * (this.nightMultiplier - 1) : 0;
        let waitingCharge = waitingTime * this.waitingChargePerMin;
        
        let totalFare = baseFare + distanceCharge + nightCharge + waitingCharge;
        totalFare = Math.max(totalFare, this.minimumFare);
        
        return {
            totalFare: Math.round(totalFare),
            breakdown: {
                baseFare: Math.round(baseFare),
                distanceCharge: Math.round(distanceCharge),
                nightCharge: Math.round(nightCharge),
                waitingCharge: Math.round(waitingCharge)
            }
        };
    }

    calculateFareWithAdjustments(distance, time, waitingTime = 0, timestamp = new Date()) {
        const date = new Date(timestamp);
        const hour = date.getHours();
        const dayIndex = date.getDay();
        const isNight = (hour >= 0 && hour < 5);
        
        let timeCategory;
        if (hour >= 0 && hour < 5) timeCategory = 'night';
        else if (hour >= 5 && hour < 12) timeCategory = 'morning';
        else if (hour >= 12 && hour < 17) timeCategory = 'afternoon';
        else if (hour >= 17 && hour < 21) timeCategory = 'evening';
        else timeCategory = 'night';
        
        const timeAdjustment = this.adjustmentFactors.timeOfDay[timeCategory];
        const dayAdjustment = this.adjustmentFactors.dayOfWeek[dayIndex];
        const trafficAdjustment = this.estimateTrafficConditions(hour);
        
        let result = this.calculateFare(distance, time, waitingTime, isNight);
        let adjustedFare = result.totalFare * timeAdjustment * dayAdjustment * trafficAdjustment;
        
        return {
            totalFare: Math.round(adjustedFare),
            breakdown: result.breakdown,
            adjustments: {
                time: timeAdjustment,
                day: dayAdjustment,
                traffic: trafficAdjustment,
                route: 1.0
            }
        };
    }

    estimateTrafficConditions(hour) {
        if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19)) {
            return this.adjustmentFactors.trafficConditions.high;
        } else if ((hour >= 7 && hour <= 11) || (hour >= 16 && hour <= 20)) {
            return this.adjustmentFactors.trafficConditions.medium;
        }
        return this.adjustmentFactors.trafficConditions.low;
    }

    predictFareFromReports(pickup, dropoff, distance, time, waitingTime = 0, timestamp = new Date()) {
        const standardFare = this.calculateFareWithAdjustments(
            distance, time, waitingTime, timestamp
        );
        
        const similarTrips = this.tripDatabase.getTripsForRoute(pickup, dropoff);
        console.log("Similar trips found:", similarTrips.length);
        
        const reportedTrips = similarTrips.filter(trip => trip.actualFare !== null);
        console.log("Reported trips found:", reportedTrips.length);
        
        if (reportedTrips.length < 1) {
            // No reports yet, use standard fare
            const totalFare = standardFare.breakdown.baseFare + 
                            standardFare.breakdown.distanceCharge + 
                            standardFare.breakdown.nightCharge + 
                            standardFare.breakdown.waitingCharge;
            return {
                fare: Math.round(totalFare),
                breakdown: standardFare.breakdown,
                confidence: 0.7
            };
        }
        
        let totalWeight = 0;
        let weightedFare = 0;
        
        reportedTrips.forEach(trip => {
            const timeDiff = Math.abs(new Date(timestamp) - new Date(trip.timestamp)) / (1000 * 60 * 60 * 24);
            const distanceDiff = Math.abs(trip.estimatedDistance - distance);
            const weight = 1 / (1 + timeDiff * 0.1 + distanceDiff * 0.5);
            
            totalWeight += weight;
            weightedFare += (trip.actualFare / trip.estimatedDistance * distance) * weight;
        });
        
        const predictedFare = weightedFare / totalWeight;
        const confidence = Math.min(0.95, 0.85 + (reportedTrips.length * 0.02));
        
        // Calculate the adjustment ratio between predicted and standard fare
        const standardTotal = standardFare.breakdown.baseFare + 
                            standardFare.breakdown.distanceCharge + 
                            standardFare.breakdown.nightCharge + 
                            standardFare.breakdown.waitingCharge;
        const adjustmentRatio = predictedFare / standardTotal;
        
        // Adjust the breakdown components proportionally
        const adjustedBreakdown = {
            baseFare: Math.round(standardFare.breakdown.baseFare * adjustmentRatio),
            distanceCharge: Math.round(standardFare.breakdown.distanceCharge * adjustmentRatio),
            nightCharge: Math.round(standardFare.breakdown.nightCharge * adjustmentRatio),
            waitingCharge: Math.round(standardFare.breakdown.waitingCharge * adjustmentRatio)
        };
        
        return {
            fare: Math.round(predictedFare),
            breakdown: adjustedBreakdown,
            adjustments: standardFare.adjustments,
            confidence: confidence
        };
    }
}

// Helper function for location distance calculation
function calculateLocationDistance(location1, location2) {
    const lat1 = location1.lat;
    const lon1 = location1.lon;
    const lat2 = location2.lat;
    const lon2 = location2.lon;
    
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
}

// Export the classes for use in main app
window.FareCalculationSystem = {
    TripData,
    TripDatabase,
    FareCalculator,
    calculateLocationDistance
}; 