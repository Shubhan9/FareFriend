// Constants for fare calculation
const FARE_CONSTANTS = {
    BASE_FARE: 26, // New base fare in Mumbai (₹)
    PER_KM_RATE: 17.14, // Rate per km after first 1.5km (₹)
    MIN_DISTANCE: 1.5, // Minimum distance covered in base fare (km)
    NIGHT_CHARGE_MULTIPLIER: 1.25, // 25% extra for night rides
    NIGHT_START_HOUR: 22, // 10 PM
    NIGHT_END_HOUR: 5, // 5 AM
    WAITING_CHARGE_PER_MIN: 2.6, // ₹2.6 per minute of waiting
    TRAFFIC_SLOW_THRESHOLD: 15, // km/h - below this is considered slow traffic
};

// Cache for user's saved trips and preferences
let userCache = {
    history: JSON.parse(localStorage.getItem('tripHistory')) || [],
    savedLocations: JSON.parse(localStorage.getItem('savedLocations')) || [],
    lastUsedLocations: JSON.parse(localStorage.getItem('lastUsedLocations')) || { pickup: "", dropoff: "" }
};

// DOM Elements
const pickupInput = document.getElementById('pickup-location');
const dropoffInput = document.getElementById('dropoff-location');
const currentLocationBtn = document.getElementById('current-location');
const journeyTimeSelect = document.getElementById('journey-time');
const scheduleTimeContainer = document.getElementById('schedule-time-container');
const scheduleTimeInput = document.getElementById('schedule-time');
const calculateFareBtn = document.getElementById('calculate-fare');
const fareResultSection = document.getElementById('fare-result');
const distanceValue = document.getElementById('distance-value');
const timeValue = document.getElementById('time-value');
const baseFare = document.getElementById('base-fare');
const distanceCharged = document.getElementById('distance-charged');
const distanceFare = document.getElementById('distance-fare');
const nightChargeRow = document.getElementById('night-charge-row');
const nightFare = document.getElementById('night-fare');
const waitingChargeRow = document.getElementById('waiting-charge-row');
const waitingFare = document.getElementById('waiting-fare');
const totalFare = document.getElementById('total-fare');
const autoFareCompare = document.getElementById('auto-fare-compare');
const olaFare = document.getElementById('ola-fare');
const uberFare = document.getElementById('uber-fare');
const confidenceValue = document.getElementById('confidence-value');
const mapThumbnail = document.getElementById('map-thumbnail');
const reportBtn = document.getElementById('report-btn');
const shareBtn = document.getElementById('share-btn');
const saveBtn = document.getElementById('save-btn');
const historyBtn = document.getElementById('history-btn');
const profileBtn = document.getElementById('profile-btn');
const reportModal = document.getElementById('report-modal');
const historyModal = document.getElementById('history-modal');
const closeModalBtns = document.querySelectorAll('.close-modal');
const submitReportBtn = document.getElementById('submit-report');
const actualFareInput = document.getElementById('actual-fare');
const fareIssuesSelect = document.getElementById('fare-issues');
const additionalCommentsInput = document.getElementById('additional-comments');
const historyList = document.getElementById('history-list');

// Initialize fare calculator
let fareCalculator;
let tripDatabase;

function initApp() {
    if (userCache.lastUsedLocations.pickup) {
        pickupInput.value = userCache.lastUsedLocations.pickup;
    }
    if (userCache.lastUsedLocations.dropoff) {
        dropoffInput.value = userCache.lastUsedLocations.dropoff;
    }
    
    // Initialize the fare calculation system
    fareCalculator = new FareCalculationSystem.FareCalculator();
    tripDatabase = new FareCalculationSystem.TripDatabase();
    fareCalculator.loadAdjustmentFactors();
    
    renderTripHistory();
    const now = new Date();
    now.setHours(now.getHours() + 1);
    scheduleTimeInput.value = now.toISOString().slice(0, 16);
    initializeMap();
    setupEventListeners();
}

// Set up all event listeners for the app
function setupEventListeners() {
    journeyTimeSelect.addEventListener('change', function() {
        scheduleTimeContainer.style.display = this.value === 'schedule' ? 'block' : 'none';
    });
    currentLocationBtn.addEventListener('click', getCurrentLocation);
    calculateFareBtn.addEventListener('click', calculateFare);
    closeModalBtns.forEach(btn => btn.addEventListener('click', closeModals));
    reportBtn.addEventListener('click', () => reportModal.style.display = 'block');
    historyBtn.addEventListener('click', () => {
        renderTripHistory();
        historyModal.style.display = 'block';
    });
    submitReportBtn.addEventListener('click', submitFareReport);
    shareBtn.addEventListener('click', shareTrip);
    saveBtn.addEventListener('click', saveTrip);
    profileBtn.addEventListener('click', showUserProfile);
    window.addEventListener('click', function(event) {
        if (event.target === reportModal) reportModal.style.display = 'none';
        if (event.target === historyModal) historyModal.style.display = 'none';
        if (event.target === profileModal) profileModal.style.display = 'none';
    });
}

// Get current location using Geolocation API
function getCurrentLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }
    pickupInput.placeholder = 'Getting your location...';
    navigator.geolocation.getCurrentPosition(
        async position => {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
                const data = await response.json();
                const address = data.display_name.split(',').slice(0, 3).join(', ');
                pickupInput.value = address;
            } catch (error) {
                pickupInput.value = `${position.coords.latitude}, ${position.coords.longitude}`;
                console.error('Error fetching address:', error);
            }
        },
        error => {
            pickupInput.placeholder = 'Enter pickup location...';
            alert(`Unable to retrieve your location: ${error.message}`);
        }
    );
}

// Initialize map for route visualization
function initializeMap() {
    mapThumbnail.innerHTML = '<div style="width:100%;height:100%;display:flex;justify-content:center;align-items:center;background:#f0f0f0;color:#666;font-size:12px;">Route map will appear here</div>';
}

// Helper function to estimate traffic based on time of day
function getTrafficEstimate(fareTime) {
    const hour = fareTime.getHours();
    const day = fareTime.getDay(); // 0 = Sunday, 6 = Saturday
    let trafficMultiplier = 1.0;
    let trafficCondition = 'normal';

    if (day >= 1 && day <= 5) { // Weekdays
        if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19)) {
            trafficMultiplier = 1.5;
            trafficCondition = 'moderate';
            if (hour === 9 || hour === 18) {
                trafficMultiplier = 1.8;
                trafficCondition = 'heavy';
            }
        } else if ((hour >= 11 && hour <= 16) || (hour >= 20 && hour <= 22)) {
            trafficMultiplier = 1.2;
            trafficCondition = 'light';
        }
    } else { // Weekends
        trafficMultiplier = 0.8;
        trafficCondition = 'normal';
        if (hour >= 18 && hour <= 21) {
            trafficMultiplier = 1.3;
            trafficCondition = 'moderate';
        }
    }

    return { multiplier: trafficMultiplier, condition: trafficCondition };
}

// Calculate route distance and time with traffic estimation
async function calculateRouteInfo(pickup, dropoff, fareTime) {
    try {
        const pickupCoords = await geocodeAddress(pickup);
        const dropoffCoords = await geocodeAddress(dropoff);
        if (!pickupCoords || !dropoffCoords) {
            throw new Error('Could not geocode one or both addresses');
        }

        // Calculate straight-line distance first
        const straightLineDistance = calculateLocationDistance(pickupCoords, dropoffCoords);
        
        // Apply Mumbai-specific route factor (auto-rickshaws often take shorter routes)
        // Factor of 1.2 accounts for actual road distance vs straight line
        let distanceKm = straightLineDistance * 1.2;
        
        // Round to 1 decimal place
        distanceKm = Math.round(distanceKm * 10) / 10;
        
        // Calculate base duration (assuming average speed of 20 km/h in Mumbai)
        let baseDurationMin = Math.ceil((distanceKm / 20) * 60);
        
        // Apply Mumbai-specific time adjustments
        if (distanceKm <= 2) {
            baseDurationMin += 5; // Additional time for short trips (traffic lights, etc)
        } else if (distanceKm <= 5) {
            baseDurationMin += 8;
        } else if (distanceKm <= 10) {
            baseDurationMin += 12;
        } else {
            baseDurationMin += 15;
        }

        // Apply traffic estimation
        const { multiplier, condition } = getTrafficEstimate(fareTime);
        const trafficDurationMin = Math.ceil(baseDurationMin * multiplier);
        const trafficDelayMin = trafficDurationMin - baseDurationMin;

        let waitingTimeEstimate = 0;
        if (condition === 'heavy') {
            waitingTimeEstimate = Math.ceil(trafficDelayMin * 0.8);
        } else if (condition === 'moderate') {
            waitingTimeEstimate = Math.ceil(trafficDelayMin * 0.5);
        } else if (condition === 'light') {
            waitingTimeEstimate = Math.ceil(trafficDelayMin * 0.3);
        }

        const avgSpeedWithTraffic = (distanceKm / (trafficDurationMin / 60)).toFixed(1);

        renderRouteMap(pickupCoords, dropoffCoords, condition);

        return {
            distance: distanceKm,
            baseDuration: baseDurationMin,
            trafficDuration: trafficDurationMin,
            trafficDelay: trafficDelayMin,
            avgSpeed: avgSpeedWithTraffic,
            trafficCondition: condition,
            waitingTimeEstimate: waitingTimeEstimate,
            coordinates: { pickup: pickupCoords, dropoff: dropoffCoords }
        };
    } catch (error) {
        console.error('Error calculating route:', error);
        alert('Could not calculate route. Please check the addresses and try again.');
        return null;
    }
}

// Geocode an address to get coordinates
// Improved geocode function to handle more location types
async function geocodeAddress(address) {
    try {
        // Try with OpenStreetMap's Nominatim first
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1&countrycodes=in`);
        const data = await response.json();
        
        if (data.length > 0) {
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
        
        // If OpenStreetMap fails, try with specific handling for known locations
        const knownLocations = {
            'vesit': { lat: 19.0457, lon: 72.8890 },
            'vivekanand education society\'s institute of technology': { lat: 19.0457, lon: 72.8890 },
            'ves': { lat: 19.0457, lon: 72.8890 },
            'vivekanand education society': { lat: 19.0457, lon: 72.8890 },
            'chembur': { lat: 19.0522, lon: 72.8994 },
            'dadar': { lat: 19.0178, lon: 72.8478 },
            'andheri': { lat: 19.1136, lon: 72.8697 },
            'bandra': { lat: 19.0596, lon: 72.8295 },
            'cst': { lat: 18.9398, lon: 72.8354 },
            'churchgate': { lat: 18.9322, lon: 72.8264 },
            'thane': { lat: 19.2183, lon: 72.9781 },
            'kurla': { lat: 19.0726, lon: 72.8845 },
            'ghatkopar': { lat: 19.0790, lon: 72.9080 },
            'vikhroli': { lat: 19.1142, lon: 72.9340 },
            'powai': { lat: 19.1176, lon: 72.9060 },
            'mulund': { lat: 19.1765, lon: 72.9475 },
            'borivali': { lat: 19.2362, lon: 72.8546 },
            'malad': { lat: 19.1874, lon: 72.8484 },
            'goregaon': { lat: 19.1663, lon: 72.8526 },
            'vashi': { lat: 19.0750, lon: 72.9957 },
            'nerul': { lat: 19.0362, lon: 73.0184 },
            'panvel': { lat: 18.9894, lon: 73.1175 },
            'belapur': { lat: 19.0237, lon: 73.0407 },
            'kharghar': { lat: 19.0474, lon: 73.0675 }
        };
        
        // Check if the address or parts of it match any known locations
        const normalizedAddress = address.toLowerCase().trim();
        for (const [key, coords] of Object.entries(knownLocations)) {
            if (normalizedAddress.includes(key)) {
                return coords;
            }
        }
        
        // If still no match, try as a last resort to parse coordinates directly
        const coordsRegex = /^\s*(\d+\.\d+)\s*,\s*(\d+\.\d+)\s*$/;
        const coordsMatch = address.match(coordsRegex);
        if (coordsMatch) {
            return { lat: parseFloat(coordsMatch[1]), lon: parseFloat(coordsMatch[2]) };
        }
        
        throw new Error(`Address not found: ${address}`);
    } catch (error) {
        console.error('Geocoding error:', error);
        alert(`Could not find location: ${address}. Please try a more specific address or nearby landmark.`);
        return null;
    }
}

// Render a static map with traffic indication
function renderRouteMap(pickupCoords, dropoffCoords, trafficCondition) {
    let routeColor = "#1A73E8"; // Blue for normal
    if (trafficCondition === 'heavy') routeColor = "#FF0000"; // Red
    else if (trafficCondition === 'moderate') routeColor = "#FFA500"; // Orange
    else if (trafficCondition === 'light') routeColor = "#FFFF00"; // Yellow

    const svg = `
    <svg width="100%" height="100%" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#e6e6e6" />
        <circle cx="30" cy="50" r="8" fill="#F7B801" />
        <circle cx="170" cy="50" r="8" fill="#00A64A" />
        <line x1="30" y1="50" x2="170" y2="50" stroke="${routeColor}" stroke-width="4" stroke-linecap="round" stroke-dasharray="10,5" />
        <text x="30" y="75" font-size="14" text-anchor="middle" fill="#000">A</text>
        <text x="170" y="75" font-size="14" text-anchor="middle" fill="#000">B</text>
    </svg>`;
    mapThumbnail.innerHTML = svg;
}

// Calculate fare with traffic integration
// Calculate fare with improved error handling
function calculateFare() {
    const pickup = pickupInput.value.trim();
    const dropoff = dropoffInput.value.trim();

    if (!pickup || !dropoff) {
        alert('Please enter both pickup and dropoff locations');
        return;
    }

    userCache.lastUsedLocations = { pickup, dropoff };
    localStorage.setItem('lastUsedLocations', JSON.stringify(userCache.lastUsedLocations));

    calculateFareBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
    calculateFareBtn.disabled = true;

    const fareTime = journeyTimeSelect.value === 'schedule' ? new Date(scheduleTimeInput.value) : new Date();

    calculateRouteInfo(pickup, dropoff, fareTime).then(routeInfo => {
        if (!routeInfo) {
            calculateFareBtn.innerHTML = '<i class="fas fa-rupee-sign"></i> Calculate Fare';
            calculateFareBtn.disabled = false;
            return;
        }

        distanceValue.textContent = routeInfo.distance;
        timeValue.textContent = routeInfo.baseDuration;

        const fareDetails = computeFareComponents(routeInfo);
        updateFareDisplay(fareDetails, routeInfo);

        const compareEstimates = estimateRideHailingFares(routeInfo);
        olaFare.textContent = compareEstimates.ola;
        uberFare.textContent = compareEstimates.uber;

        fareResultSection.style.display = 'block';
        calculateFareBtn.innerHTML = '<i class="fas fa-rupee-sign"></i> Calculate Fare';
        calculateFareBtn.disabled = false;
        fareResultSection.scrollIntoView({ behavior: 'smooth' });
    }).catch(error => {
        console.error('Error in fare calculation:', error);
        alert('Something went wrong while calculating the fare. Please try again with different locations.');
        calculateFareBtn.innerHTML = '<i class="fas fa-rupee-sign"></i> Calculate Fare';
        calculateFareBtn.disabled = false;
    });
}

// Compute fare components with traffic data
function computeFareComponents(routeInfo) {
    const fareTime = journeyTimeSelect.value === 'schedule' ? new Date(scheduleTimeInput.value) : new Date();
    
    // Get coordinates for route-specific adjustments
    const pickup = {
        name: pickupInput.value,
        lat: routeInfo.coordinates.pickup.lat,
        lon: routeInfo.coordinates.pickup.lon
    };
    
    const dropoff = {
        name: dropoffInput.value,
        lat: routeInfo.coordinates.dropoff.lat,
        lon: routeInfo.coordinates.dropoff.lon
    };

    // Calculate fare using the new system
    const result = fareCalculator.predictFareFromReports(
        pickup,
        dropoff,
        routeInfo.distance,
        routeInfo.trafficDuration,
        routeInfo.waitingTimeEstimate,
        fareTime
    );

    return {
        baseFare: result.breakdown.baseFare,
        distanceFare: result.breakdown.distanceCharge,
        chargeableDistance: (routeInfo.distance - FARE_CONSTANTS.MIN_DISTANCE).toFixed(1),
        nightCharge: result.breakdown.nightCharge,
        isNightTime: fareTime.getHours() >= FARE_CONSTANTS.NIGHT_START_HOUR || fareTime.getHours() < FARE_CONSTANTS.NIGHT_END_HOUR,
        waitingCharge: result.breakdown.waitingCharge,
        waitingTimeMinutes: routeInfo.waitingTimeEstimate,
        trafficCondition: routeInfo.trafficCondition,
        trafficDelay: routeInfo.trafficDelay,
        totalFare: result.fare,
        confidenceScore: Math.round(result.confidence * 100)
    };
}

// Update the fare display with traffic info
function updateFareDisplay(fareDetails, routeInfo) {
    // Add recent reports section before fare breakdown
    const recentReports = tripDatabase.getTripsForRoute({
        name: pickupInput.value,
        lat: routeInfo.coordinates.pickup.lat,
        lon: routeInfo.coordinates.pickup.lon
    }, {
        name: dropoffInput.value,
        lat: routeInfo.coordinates.dropoff.lat,
        lon: routeInfo.coordinates.dropoff.lon
    });

    const reportedTrips = recentReports.filter(trip => trip.actualFare !== null);
    
    if (reportedTrips.length > 0) {
        // Check for meter tampering reports
        const tamperingReports = reportedTrips.filter(trip => 
            trip.issues && trip.issues.includes('meter_tampering')
        );
        
        const warningHTML = tamperingReports.length > 0 ? 
            `<div class="tampering-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Warning:</strong> ${tamperingReports.length} user(s) reported meter tampering on this route.
                Consider taking a photo of the meter before starting your journey.
            </div>` : '';

        const reportsHTML = reportedTrips.map(trip => {
            const reportDate = new Date(trip.timestamp);
            const formattedDate = reportDate.toLocaleDateString('en-US', { 
                day: 'numeric', 
                month: 'long',
                year: 'numeric'
            });
            
            const issueIcons = trip.issues ? trip.issues.map(issue => {
                if (issue === 'meter_tampering') return '<i class="fas fa-exclamation-triangle" title="Meter Tampering Reported"></i>';
                if (issue === 'overcharge') return '<i class="fas fa-rupee-sign" title="Overcharging Reported"></i>';
                if (issue === 'refusal') return '<i class="fas fa-ban" title="Trip Refusal Reported"></i>';
                return '';
            }).join(' ') : '';

            return `<div class="report-item ${trip.issues && trip.issues.includes('meter_tampering') ? 'warning' : ''}">
                <i class="fas fa-info-circle"></i> User reported ₹${trip.actualFare} on ${formattedDate} ${issueIcons}
            </div>`;
        }).join('');

        // Insert reports before fare breakdown
        const reportSection = `
            <div class="user-reports">
                <h4>Recent Fare Reports</h4>
                ${warningHTML}
                ${reportsHTML}
            </div>
        `;
        document.querySelector('.fare-breakdown').insertAdjacentHTML('beforebegin', reportSection);
    }

    baseFare.textContent = fareDetails.baseFare;
    distanceCharged.textContent = fareDetails.chargeableDistance;
    distanceFare.textContent = fareDetails.distanceFare;

    if (fareDetails.isNightTime && fareDetails.nightCharge > 0) {
        nightChargeRow.style.display = 'table-row';
        nightFare.textContent = fareDetails.nightCharge;
    } else {
        nightChargeRow.style.display = 'none';
    }

    if (fareDetails.waitingCharge > 0) {
        waitingChargeRow.style.display = 'table-row';
        waitingFare.textContent = fareDetails.waitingCharge;
        const waitingLabel = document.querySelector('[for="waiting-fare"]');
        if (waitingLabel) {
            waitingLabel.innerHTML = `Waiting Charge <small>(${fareDetails.waitingTimeMinutes} min, ${fareDetails.trafficCondition} traffic)</small>`;
        }
    } else {
        waitingChargeRow.style.display = 'none';
    }

    totalFare.textContent = fareDetails.totalFare;
    autoFareCompare.textContent = fareDetails.totalFare;
    
    // Update per-person fare
    const passengerCount = parseInt(document.getElementById('passenger-count').value);
    const perPersonFare = Math.ceil(fareDetails.totalFare / passengerCount);
    document.getElementById('per-person-fare').textContent = perPersonFare;
    
    // Show/hide per-person section based on passenger count
    const perPersonSection = document.getElementById('per-person-section');
    perPersonSection.style.display = passengerCount > 1 ? 'flex' : 'none';

    confidenceValue.textContent = fareDetails.confidenceScore + '%';

    if (fareDetails.trafficDelay > 0) {
        timeValue.innerHTML = `${routeInfo.baseDuration} min <small>(+${fareDetails.trafficDelay} min due to traffic)</small>`;
    } else {
        timeValue.textContent = routeInfo.trafficDuration + ' min';
    }

    const compareEstimates = estimateRideHailingFares(routeInfo);
    
    // Add surge indicator if applicable (now above the comparison cards)
    const surgeIndicator = compareEstimates.surgeFactor > 1.2 ? 
        `<div class="surge-warning">
            <i class="fas fa-bolt"></i> Surge pricing in effect (${(compareEstimates.surgeFactor).toFixed(1)}x)
        </div>` : '';
    
    document.getElementById('surge-indicator').innerHTML = surgeIndicator;
    
    olaFare.textContent = compareEstimates.ola;
    uberFare.textContent = compareEstimates.uber;
}

// Estimate ride-hailing fares with improved accuracy
function estimateRideHailingFares(routeInfo) {
    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay();
    
    // Dynamic surge calculation based on time and day
    let surgeFactor = 1.0;
    
    // Peak hours surge (reduced surge factors)
    const isPeakMorning = currentHour >= 8 && currentHour <= 10;
    const isPeakEvening = currentHour >= 17 && currentHour <= 20;
    const isWeekend = currentDay === 0 || currentDay === 6;
    
    if (isPeakMorning || isPeakEvening) {
        surgeFactor += 0.2; // Reduced from 0.3
    }
    
    // Weekend adjustment (reduced)
    if (isWeekend && currentHour >= 18 && currentHour <= 23) {
        surgeFactor += 0.15; // Reduced from 0.2
    }
    
    // Traffic condition surge (reduced)
    if (routeInfo.trafficCondition === 'heavy') {
        surgeFactor += 0.25; // Reduced from 0.4
    } else if (routeInfo.trafficCondition === 'moderate') {
        surgeFactor += 0.15; // Reduced from 0.2
    }

    // Cap the surge factor (reduced max surge)
    surgeFactor = Math.min(surgeFactor, 2.0); // Reduced from 2.5

    // Ola Auto fare calculation (updated rates)
    const olaBaseFare = 35; // Reduced from 40
    const olaPerKm = 10;    // Reduced from 11
    const olaPerMin = 0.8;  // Reduced from 1
    const olaMinFare = 50;  // Reduced from 60
    
    let olaEstimate = Math.ceil((
        olaBaseFare + 
        (routeInfo.distance * olaPerKm) + 
        (routeInfo.trafficDuration * olaPerMin)
    ) * surgeFactor);
    
    olaEstimate = Math.max(olaEstimate, olaMinFare);

    // Uber Auto fare calculation (updated rates)
    const uberBaseFare = 38; // Reduced from 42
    const uberPerKm = 11;    // Reduced from 12
    const uberPerMin = 1;    // Reduced from 1.2
    const uberMinFare = 55;  // Reduced from 65
    
    let uberEstimate = Math.ceil((
        uberBaseFare + 
        (routeInfo.distance * uberPerKm) + 
        (routeInfo.trafficDuration * uberPerMin)
    ) * surgeFactor);
    
    uberEstimate = Math.max(uberEstimate, uberMinFare);

    // Add range for more realistic estimates (reduced range)
    const olaRange = {
        min: Math.floor(olaEstimate * 0.95), // Reduced range from 0.9
        max: Math.ceil(olaEstimate * 1.05)   // Reduced range from 1.1
    };
    
    const uberRange = {
        min: Math.floor(uberEstimate * 0.95), // Reduced range from 0.9
        max: Math.ceil(uberEstimate * 1.05)   // Reduced range from 1.1
    };

    return { 
        ola: `₹${olaRange.min}-${olaRange.max}`,
        uber: `₹${uberRange.min}-${uberRange.max}`,
        surgeFactor: surgeFactor
    };
}

// Close all modals
function closeModals() {
    reportModal.style.display = 'none';
    historyModal.style.display = 'none';
}

// Submit a fare report
function submitFareReport() {
    const actualFare = parseInt(actualFareInput.value);
    if (!actualFare || isNaN(actualFare)) {
        alert('Please enter a valid fare amount');
        return;
    }

    const selectedIssues = Array.from(fareIssuesSelect.selectedOptions).map(option => option.value);
    
    // Create trip data using the new system
    const tripData = new FareCalculationSystem.TripData(
        pickupInput.value,
        dropoffInput.value,
        parseFloat(distanceValue.textContent),
        parseInt(timeValue.textContent),
        parseInt(totalFare.textContent),
        actualFare,
        selectedIssues,
        new Date().toISOString()
    );

    // Set fare breakdown
    tripData.setFareBreakdown(
        parseInt(baseFare.textContent),
        parseInt(distanceFare.textContent),
        parseInt(nightFare.textContent) || 0,
        parseInt(waitingFare.textContent) || 0
    );

    // Save to database
    tripDatabase.addTrip(tripData);
    
    // Update fare calculator
    fareCalculator.updateAdjustmentFactors();

    // Clear form and close modal
    actualFareInput.value = '';
    fareIssuesSelect.selectedIndex = -1;
    additionalCommentsInput.value = '';
    reportModal.style.display = 'none';
    alert('Thanks for reporting! Your data helps make fare estimation more accurate.');
}

// Share trip details
function shareTrip() {
    const shareText = `I'm taking an auto from ${pickupInput.value} to ${dropoffInput.value}. The estimated fare is ₹${totalFare.textContent}. Powered by FareFriend!`;
    if (navigator.share) {
        navigator.share({
            title: 'My Auto Fare Estimate',
            text: shareText,
            url: window.location.href
        }).then(() => console.log('Shared successfully')).catch(error => console.log('Error sharing:', error));
    } else {
        alert(`Share this info:\n\n${shareText}`);
    }
}

// Save trip to history
function saveTrip() {
    const trip = {
        id: Date.now(),
        pickup: pickupInput.value,
        dropoff: dropoffInput.value,
        distance: parseFloat(distanceValue.textContent),
        duration: parseInt(timeValue.textContent),
        fare: parseInt(totalFare.textContent),
        date: new Date().toISOString()
    };
    userCache.history.unshift(trip);
    if (userCache.history.length > 20) userCache.history = userCache.history.slice(0, 20);
    localStorage.setItem('tripHistory', JSON.stringify(userCache.history));
    alert('Trip saved to history!');
}

// Render trip history
function renderTripHistory() {
    if (userCache.history.length === 0) {
        historyList.innerHTML = '<p>No trip history yet. Your saved trips will appear here.</p>';
        return;
    }
    let historyHTML = '';
    userCache.history.forEach(trip => {
        const tripDate = new Date(trip.date);
        const formattedDate = tripDate.toLocaleDateString() + ' ' + tripDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        historyHTML += `
        <div class="history-item">
            <div class="history-route-info">
                <h4>${trip.pickup} → ${trip.dropoff}</h4>
                <p>${trip.distance} km · ${formattedDate}</p>
            </div>
            <div class="history-fare">₹${trip.fare}</div>
        </div>`;
    });
    historyList.innerHTML = historyHTML;
}

// Create custom auto-rickshaw logo
function createRickshawLogo() {
    const logoImg = document.getElementById('logo-img');
    logoImg.outerHTML = `
    <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="25" x="5" y="15" fill="#F7B801" rx="5" />
        <circle cx="15" cy="40" r="7" fill="#333" stroke="#666" stroke-width="2" />
        <circle cx="35" cy="40" r="7" fill="#333" stroke="#666" stroke-width="2" />
        <path d="M5 25 L5 15 Q5 5 15 5 L35 5 Q45 5 45 15 L45 25" fill="none" stroke="#00A64A" stroke-width="2" />
        <rect width="15" height="10" x="17.5" y="10" fill="#1A73E8" rx="2" />
    </svg>`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    createRickshawLogo();
});

// Show user profile modal
function showUserProfile() {
    // If you don't have a profile modal yet, create one
    if (!document.getElementById('profile-modal')) {
        createProfileModal();
    }
    
    // Show the profile modal
    document.getElementById('profile-modal').style.display = 'block';
}

// Create profile modal if it doesn't exist
function createProfileModal() {
    const modal = document.createElement('div');
    modal.id = 'profile-modal';
    modal.className = 'modal';
    
    const savedLocations = userCache.savedLocations || [];
    const tripCount = userCache.history.length;
    
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <h2>Your Profile</h2>
            <div class="profile-stats">
                <div class="stat-item">
                    <h3>${tripCount}</h3>
                    <p>Saved Trips</p>
                </div>
                <div class="stat-item">
                    <h3>${savedLocations.length}</h3>
                    <p>Saved Locations</p>
                </div>
            </div>
            <div class="profile-saved-locations">
                <h3>Frequently Used Locations</h3>
                <div id="saved-locations-list">
                    ${savedLocations.length > 0 ? 
                        savedLocations.map(loc => 
                            `<div class="saved-location-item">
                                <p>${loc.name}</p>
                                <p class="location-address">${loc.address}</p>
                            </div>`
                        ).join('') : 
                        '<p>No saved locations yet.</p>'}
                </div>
            </div>
            <button id="add-location-btn" class="btn">Add New Location</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners for the new modal
    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    modal.querySelector('#add-location-btn').addEventListener('click', () => {
        // Implement add location functionality
        const locationName = prompt('Enter a name for this location:');
        const locationAddress = prompt('Enter the address:');
        
        if (locationName && locationAddress) {
            const newLocation = {
                name: locationName,
                address: locationAddress,
                timestamp: new Date().toISOString()
            };
            
            userCache.savedLocations.push(newLocation);
            localStorage.setItem('savedLocations', JSON.stringify(userCache.savedLocations));
            
            // Refresh the profile modal to show the new location
            document.body.removeChild(modal);
            createProfileModal();
            showUserProfile();
        }
    });
}

// Add event listener for passenger count changes
document.getElementById('passenger-count').addEventListener('change', function() {
    const fareResult = document.getElementById('fare-result');
    if (fareResult.style.display !== 'none') {
        // Recalculate per-person fare without recalculating the entire fare
        const totalFareAmount = parseInt(document.getElementById('total-fare').textContent);
        const passengerCount = parseInt(this.value);
        const perPersonFare = Math.ceil(totalFareAmount / passengerCount);
        document.getElementById('per-person-fare').textContent = perPersonFare;
        document.getElementById('per-person-section').style.display = passengerCount > 1 ? 'flex' : 'none';
    }
});