const {Client} = require('pg');
const config = require('./config');
const { encrypt, decrypt } = require('./crypto');

const debugPgConfig = {
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    host: config.DB_HOST,
    port: config.DB_PORT,
};

const prodPgConfig = {
    connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
}

const client = new Client(config.ENV === 'prod'? prodPgConfig : debugPgConfig);

client.connect(err=>{
    if (err) {
        console.error("connection error", err.stack);
    } else {
        console.log("connected");
    }
});

async function addSubscriber(userId, 
    range=config.DEFAULT_RANGE_MI, 
    zipcode=config.DEFAULT_ZIPCODE, 
    active=false) {
    try {
        const query = 'INSERT INTO subscribers(id, range, zipcode, active) VALUES($1, $2, $3, $4)';
        const values = [
            userId, 
            encrypt(range.toString()),
            encrypt(zipcode.toString()),
            active,
        ]
        await client.query(query, values);
    } catch (err) {
        console.log(err.stack);
    }
}

async function getAllSubscribers() {
    try {
        const query = `SELECT id, range, zipcode, active
        FROM subscribers WHERE active = true`;
        const res = await client.query(query);
        if (!res.rowCount) {
            return []
        } else {
            return res.rows;
        }
    } catch (err) {
        console.log(err.stack);
    }
}

async function getUser(userId) {
    try {
        const query = `SELECT id, range, zipcode, active
        FROM subscribers WHERE id = ${parseInt(userId)}`;
        const res = await client.query(query);
        if (!res.rowCount) {
            return null;
        } else {
            const {id, range, zipcode, active} = res.rows[0];
            return {
                id, 
                range: decrypt(range),
                zipcode: decrypt(zipcode),
                active,
            };
        }
    } catch (err) {
        console.log(err.stack);
    }
}

async function setSubscription(userId, active) {
    try {
        const query = `UPDATE subscribers SET active = ${!!active} WHERE id = ${parseInt(userId)}`;
        await client.query(query);
    } catch (err) {
        console.log(err.stack);
    }
}

async function setZipcode(userId, zipcode) {
    try {
        const encryptedZipcode = JSON.stringify(encrypt(zipcode));
        const query = `UPDATE subscribers SET zipcode = \'${encryptedZipcode}\' WHERE id = ${parseInt(userId)}`;
        await client.query(query);
    } catch (err) {
        console.log(err.stack);
    }
}

async function setRange(userId, range) {
    try {
        const encryptedRange = JSON.stringify(encrypt(range.toString()));
        const query = `UPDATE subscribers SET range = \'${encryptedRange}\' WHERE id = ${parseInt(userId)}`;
        await client.query(query);
    } catch (err) {
        console.log(err.stack);
    }
}

async function getStats() {
    try {
        const query = `SELECT COUNT(*) FROM subscribers WHERE active = true`;
        const res = await client.query(query);
        return res.rows[0].count || 0;
    } catch (err) {
        console.log(err.stack);
    }
}

async function deleteUser(userId) {
    try {
        const query = `DELETE FROM subscribers WHERE id = ${parseInt(userId)}`;
        await client.query(query);
    } catch (err) {
        console.log(err.stack);
    }
}

module.exports = {
    addSubscriber,
    setSubscription,
    getUser,
    setZipcode,
    setRange,
    getStats,
    getAllSubscribers,
    deleteUser,
};