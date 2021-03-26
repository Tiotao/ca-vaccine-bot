const config = {
    MAX_SIZE: 30,
    DEFAULT_RANGE_MI: 50,
    DEFAULT_ZIPCODE: "94124",
    ZIPCODES_PATH: "postal_codes.json",
    DB_PATH: process.env.CA_VACCINE_BOT_DB_PATH || "MY DB PATH",
    BOT_KEY: process.env.CA_VACCINE_BOT_KEY || "MY BOT KEY",
    AES_KEY: process.env.CA_VACCINE_AES_KEY || "MY AES KEY",
    FETCH_FREQUENCY: "*/60 * * * *",
    VACCINE_API_URL: "https://www.vaccinespotter.org/api/v0/states/CA.json",
};

console.log(config);
module.exports = config;