const { Telegraf } = require("telegraf");
const axios = require("axios");
const cron = require("node-cron");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync("db.json");
const db = low(adapter);
const fs = require("fs");

// Set some defaults (required if your JSON file is empty)
db.defaults({ subscribers: [] }).write();

const MAX_SIZE = 30;
const DEFAULT_RANGE_MI = 50;
const DEFAULT_ZIPCODE = "94124";

const ZIPCODES_JSON = fs.readFileSync("postal_codes.json");
const ZIPCODES = JSON.parse(ZIPCODES_JSON);

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

function withinDistanceMi(coordinates, maxMiles, zipcode) {
    if (!coordinates[0] || !coordinates[1]) {
        return false;
    }
    return maxMiles > getDistance(coordinates, zipcode);
}

const bot = new Telegraf("1723224584:AAGi6rRF16nF6sJCPlYcbi1WP84eF4dLrhI");

async function subscribeToUpdates(ctx) {
    const userId = ctx.message.from.id;
    const subscriber = db.get("subscribers").find({ id: userId }).value();

    if (subscriber) {
        if (subscriber.active) {
            ctx.replyWithMarkdown("Already subscribed.");
        } else {
            db.get("subscribers")
                .find({ id: userId })
                .assign({ active: true })
                .write();
            ctx.replyWithMarkdown("Subscribe successfully.");
        }
    } else {
        db.get("subscribers")
            .push({
                id: userId,
                range: DEFAULT_RANGE_MI,
                zipcode: DEFAULT_ZIPCODE,
                active: true,
            })
            .write();
        ctx.replyWithMarkdown("Subscribe successfully.");
    }
}

async function unsubscribeUpdates(ctx) {
    const userId = ctx.message.from.id;
    const subscriber = db.get("subscribers").find({ id: userId }).value();

    if (subscriber && subscriber.active) {
        db.get("subscribers")
            .find({ id: userId })
            .assign({ active: false })
            .write();
        ctx.replyWithMarkdown("Unsubscribed.");
    } else {
        ctx.replyWithMarkdown("You never subscribe.");
    }
}

bot.start(subscribeToUpdates);

bot.command("subscribe", subscribeToUpdates);

bot.command("unsubscribe", unsubscribeUpdates);

bot.command("set_range", async (ctx) => {
    const userId = ctx.message.from.id;
    const subscriber = db.get("subscribers").find({ id: userId }).value();
    const inputRange = parseInt(ctx.message.text.split(" ")[1]);
    const range = inputRange ? inputRange : DEFAULT_RANGE_MI;

    if (subscriber) {
        db.get("subscribers").find({ id: userId }).assign({ range }).write();
    } else {
        db.get("subscribers")
            .push({
                id: userId,
                range,
                zipcode: DEFAULT_ZIPCODE,
                active: false,
            })
            .write();
    }
    ctx.replyWithMarkdown(`Range set to ${range} Mi`);
});

bot.command("set_zipcode", async (ctx) => {
    const userId = ctx.message.from.id;
    const subscriber = db.get("subscribers").find({ id: userId }).value();
    const zipcode = ctx.message.text.split(" ")[1];
    const isZipcodeValid = zipcode in ZIPCODES;

    if (!isZipcodeValid) {
        ctx.replyWithMarkdown(`Invalid zipcode: ${zipcode}.`);
        return;
    }

    if (subscriber) {
        db.get("subscribers").find({ id: userId }).assign({ zipcode }).write();
    } else {
        db.get("subscribers")
            .push({
                id: userId,
                zipcode,
                range: DEFAULT_RANGE_MI,
                active: false,
            })
            .write();
    }
    ctx.replyWithMarkdown(`Zipcode set to ${zipcode}`);
});

bot.command("now", async (ctx) => {
    const userId = ctx.message.from.id;
    const subscriber = db.get("subscribers").find({ id: userId }).value();

    const response = await fetchAppointments(
        subscriber ? subscriber.range : DEFAULT_RANGE_MI,
        subscriber ? subscriber.zipcode : DEFAULT_ZIPCODE
    );
    bot.telegram
        .sendMessage(userId, response, {
            parse_mode: "Markdown",
        })
        .catch(() => {
            db.get("subscribers")
                .find({ id: userId })
                .assign({ active: false })
                .write();
        });
});

bot.launch();

const fetchAppointments = async (range, zipcode) => {
    try {
        const {
            data: { features },
        } = await axios
            .get("https://www.vaccinespotter.org/api/v0/states/CA.json")
            .catch((error) => console.log(error));

        if (features.length > 0) {
            let availabeAppointments = features.filter((f) => {
                const hasAvailableAppointments =
                    f.properties.appointments_available_all_doses;
                const isWithinRange = withinDistanceMi(
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
                .slice(0, MAX_SIZE);

            let appointments = "";

            for (let i = 0; i < availabeAppointments.length; i++) {
                const appointment = availabeAppointments[i];
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
                appointments += `*${i + 1}. ${provider_brand_name} - ${city} (${
                    distance ? distance : "unknown"
                } mi)* ${link}\n${address}, ${city}, ${postal_code}\n`;
            }

            return `${availabeAppointments.length} Appointments.\n----------\n${appointments}`;
        }
    } catch (error) {
        throw error;
    }
};

cron.schedule("*/60 * * * *", async () => {
    const subscribers = db.get("subscribers").value();
    for (let i = 0; i < subscribers.length; i++) {
        const subscriber = subscribers[i];
        if (subscriber.active) {
            const response = await fetchAppointments(
                subscriber.range,
                subscriber.zipcode
            );
            bot.telegram
                .sendMessage(subscriber.id, response, {
                    parse_mode: "Markdown",
                })
                .catch(() => {
                    db.get("subscribers")
                        .find({ id: subscriber.id })
                        .assign({ active: false })
                        .write();
                });
        }
    }
});
