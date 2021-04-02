
const axios = require("axios");
const config = require("./config");
const fs = require("fs");
const zipcodes = require('zipcodes');
const ZIPCODES = JSON.parse(fs.readFileSync(config.ZIPCODES_PATH));

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
    const zipcodeInfo = zipcodes.lookup(zipcode);
    return getDistanceFromLatLonInMi(
        coordinates[1],
        coordinates[0],
        zipcodeInfo.latitude,
        zipcodeInfo.longitude,
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

function formatUserConfig(user) {
    const { zipcode, range } = user;
    return `----------\n*Search Preference:*\nZipcode: ${zipcode}\nRange: ${range} mi`;
}

async function fetchAppointments() {
    let promises = [];
    let appointments = {};
    for (let i = 0; i < config.VALID_STATES.length; i++) {
        const state = config.VALID_STATES[i];
        promises.push(
            fetchStateAppointments(state)
                .then(stateAppointments => {
                    appointments[state] = stateAppointments;
                }).catch((error) => {
                    throw error;
                })
        );
    }
    await Promise.all(promises);
    if (config.ENV === 'debug') {
        const fetchedStates = Object.keys(appointments);
        const fetchedAppointmentsCount = {}
        for (let i = 0; i < fetchedStates.length; i++) {
            const state = fetchedStates[i]
            fetchedAppointmentsCount[state] = appointments[state] ? appointments[state].length : 0;
        }
        console.info("Fetched: ", fetchedAppointmentsCount);
    }
    return appointments;
}

async function fetchStateAppointments(state) {
    try {
        const {
            data: { features },
        } = await axios
            .get(`${config.VACCINE_API_URL}${state}.json`)
            .catch((error) => console.log(error));
        return features;
    } catch (error) {
        return [];
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
    const link = `[Book](${url})`;
    return `*${index + 1}. ${provider_brand_name} - ${city} (${distance ? distance : "unknown"
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

    const zipcodeInfo = zipcodes.lookup(zipcode);

    if (availabeAppointments.length > 0) {
        let content = "";
        for (let i = 0; i < availabeAppointments.length; i++) {
            const appointment = availabeAppointments[i];
            content += formatAppointment(i, appointment, zipcode)
        }

        return `\u{1F489} Fuyohh! ${availabeAppointments.length} appoinment(s) found within ${range} mi of ${zipcode} (${zipcodeInfo.city}, ${zipcodeInfo.state}).\n----------\n${content}`;
    } else {
        return `\u{1F97A} Haiyaa! no appointment available within ${range} mi of ${zipcode}. Keep trying! Don't forget to wear a mask and social distance!.`
    }
}

function trackHandledEvent(ctx, intent) {
    if (!config.CHATBASE_TOKEN) return;
    ctx.chatbase.track({
        intent: intent,
        isFeedback: false,
        isHandled: true,
    }).catch((e) => {
        console.error(e);
    });
}

function trackUnhandledEvent(ctx, intent) {
    if (!config.CHATBASE_TOKEN) return;
    ctx.chatbase.track({
        intent: intent,
        isFeedback: false,
        isHandled: false,
    }).catch((e) => {
        console.error(e);
    });
}

module.exports = {
    getDistance,
    getUserId,
    fetchAppointments,
    filterAppointments,
    formatUserConfig,
    trackUnhandledEvent,
    trackHandledEvent,
    fetchStateAppointments,
    ZIPCODES
};