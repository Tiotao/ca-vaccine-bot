const config = {
    ENV: process.env.CA_VACCINE_BOT_ENV || "debug",
    MAX_SIZE: 30,
    DEFAULT_RANGE_MI: 50,
    DEFAULT_ZIPCODE: "94124",
    ZIPCODES_PATH: "postal_codes.json",
    DB_HOST: process.env.CA_VACCINE_BOT_DB_HOST || 'localhost',
    DB_PORT: process.env.CA_VACCINE_BOT_DB_PORT || 5432,
    DB_NAME: process.env.CA_VACCINE_BOT_DB_NAME || "MY DB NAME",
    DB_USER: process.env.CA_VACCINE_BOT_DB_USER || "MY DB USER",
    DB_PASSWORD: process.env.CA_VACCINE_BOT_DB_PASSWORD || "MY DB PASSWORD",
    BOT_KEY: process.env.CA_VACCINE_BOT_KEY || "MY BOT KEY",
    AES_KEY: process.env.CA_VACCINE_BOT_AES_KEY || "MY AES KEY",
    WEBHOOK_URL: process.env.BASE_URL + "webhook",
    WEBHOOK_PORT: process.env.PORT || 3000,
    FETCH_FREQUENCY: process.env.CA_VACCINE_BOT_FETCH_FREQUENCY || "*/60 * * * *",
    FETCH_FREQUENCY_DEBUG: "*/1 * * * *",
    VACCINE_API_URL: "https://www.vaccinespotter.org/api/v0/states/CA.json",
};

console.log(config);
module.exports = config;