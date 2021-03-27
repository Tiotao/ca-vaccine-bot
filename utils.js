
const axios = require("axios");
const config = require("./config");
const fs = require("fs");
const ZIPCODES = JSON.parse(fs.readFileSync(config.ZIPCODES_PATH));
const { decrypt } = require('./crypto');

function getDistanceFromLatLonInMi(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1); // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) *
            Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c * 0.621371192; // Distance in mile
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function getDistance(coordinates, zipcode) {
    const baseCoordinates = ZIPCODES[zipcode];
    return getDistanceFromLatLonInMi(
        coordinates[1],
        coordinates[0],
        baseCoordinates[1],
        baseCoordinates[0]
    );
}

function isInRagne(coordinates, maxMiles, zipcode) {
    if (!coordinates[0] || !coordinates[1]) {
        return false;
    }
    return maxMiles > getDistance(coordinates, zipcode);
}

function getUserId(ctx) {
    return ctx.message.from.id;
}

function getSubscriber(db, userId) {
    return db.get("subscribers").find({ id: userId }).value();
}

function formatUserConfig(user) {
    const zipCode = decrypt(user.zipCode);
    const range = decrypt(user.range);
    return `Zipcode: ${zipCode}\nRange: ${range}`
}

async function fetchAppointments() {
    try {
        const {
            data: { features },
        } = await axios
            .get(config.VACCINE_API_URL)
            .catch((error) => console.log(error));
        return features;
    } catch (error) {
        throw error;
    }
}

function formatAppointment(index, appointment, zipcode) {
    const {
        provider_brand_name,
        city,
        address,
        url,
        postal_code,
    } = appointment.properties;
    const distance = parseInt(
        getDistance(appointment.geometry.coordinates, zipcode)
    );
    const link = `[Check](${url})`;
    return `*${index + 1}. ${provider_brand_name} - ${city} (${
        distance ? distance : "unknown"
    } mi)* ${link}\n${address}, ${city}, ${postal_code}\n`
}

function filterAppointments(appointments, range, zipcode) {
    let availabeAppointments = [];
    if (appointments.length > 0) {
        availabeAppointments = appointments.filter((f) => {
            const hasAvailableAppointments =
                f.properties.appointments_available_all_doses;
            const isWithinRange = isInRagne(
                f.geometry.coordinates,
                range,
                zipcode
            );
            return hasAvailableAppointments && isWithinRange;
        });

        availabeAppointments = availabeAppointments
            .sort((a, b) => {
                return (
                    getDistance(a.geometry.coordinates, zipcode) -
                    getDistance(b.geometry.coordinates, zipcode)
                );
            })
            .slice(0, config.MAX_SIZE);
    }

    if (availabeAppointments.length > 0) {
        let content = "";
        for (let i = 0; i < availabeAppointments.length; i++) {
            const appointment = availabeAppointments[i];
            content += formatAppointment(i, appointment, zipcode)
        }

        return `${availabeAppointments.length} appoinment(s) found within ${range} mi of ${zipcode}.\n----------\n${content}`;
    } else {
        return `no appointments available within ${range} mi of ${zipcode}.`
    }
}

module.exports = {
    getDistance,
    getUserId,
    getSubscriber,
    fetchAppointments,
    filterAppointments,
    formatUserConfig,
    ZIPCODES
};