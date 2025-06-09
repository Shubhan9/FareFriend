# FareFriend 🚕 | Mumbai Auto-Rickshaw Fare Estimator

**Avoid fare scams. Know your ride price.**

FareFriend is a community-driven fare calculator designed for Mumbai auto-rickshaws. It estimates real-time fares based on distance, traffic, and night charges, and compares it with Ola/Uber prices. Users can report actual fares to help others, creating a more transparent and fair commuting experience.

---

## 🌟 Features

- ✅ Official auto fare calculation (based on RTO-approved rates)
- 📍 Real-time traffic integration
- 💬 Community fare reporting system
- 🚨 Tampering warnings if actual fare diverges significantly
- 🚗 Compare with Ola/Uber pricing
- 🕒 Includes night charges and waiting time
- 🧾 Trip history + fare accuracy tracking
- 🤝 Fare splitting for group rides
- 📌 Save favorite pickup/drop points
- 🔐 100% browser-based, no account/login needed

---

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Map & Geolocation**: Google Maps API, Leaflet.js
- **Icons & Fonts**: Font Awesome, Google Fonts
- **Storage**: Browser LocalStorage
- **Documentation**: Markdown, text files

---

## How It Works
1.User selects pickup and drop locations.

2.System fetches route + traffic data from Google Maps API.

3.Applies official fare chart with conditions (traffic, night charge, waiting time).

4.Shows comparison with Ola/Uber based on distance & time.

5.Users can submit actual fare they paid — this improves future estimates.

