const { ended, cooldownTime } = require('../config.json');
const rethinkdb = require('rethinkdb');

const hexRegExp = /^#[0-9A-F]{6}$/i;

const { BlockList } = require('net');
const whiteList = new BlockList();
whiteList.addRange('5.79.128.0', '5.79.255.255');
whiteList.addRange('5.206.0.0', '5.206.127.255');
whiteList.addRange('31.207.128.0', '31.207.255.255');
whiteList.addRange('37.140.0.0', '37.140.127.255');
whiteList.addRange('77.222.96.0', '77.222.127.255');
whiteList.addRange('78.29.0.0', '78.29.15.255');
whiteList.addRange('78.29.16.0', '78.29.23.255');
whiteList.addRange('78.29.24.0', '78.29.27.255');
whiteList.addRange('78.29.28.0', '78.29.29.255');
whiteList.addRange('78.29.30.0', '78.29.30.255');
whiteList.addRange('78.29.32.0', '78.29.63.255');
whiteList.addRange('80.255.80.0', '80.255.95.255');
whiteList.addRange('83.142.160.0', '83.142.167.255');
whiteList.addRange('88.206.0.0', '88.206.127.255');
whiteList.addRange('94.24.129.0', '94.24.129.255');
whiteList.addRange('94.24.130.0', '94.24.131.255');
whiteList.addRange('94.24.132.0', '94.24.135.255');
whiteList.addRange('94.24.136.0', '94.24.143.255');
whiteList.addRange('94.24.144.0', '94.24.159.255');
whiteList.addRange('94.24.160.0', '94.24.191.255');
whiteList.addRange('94.24.192.0', '94.24.255.255');
whiteList.addRange('109.191.0.0', '109.191.255.255');
whiteList.addRange('176.226.128.0', '176.226.255.255');
whiteList.addRange('185.12.228.0', '185.12.231.255');
whiteList.addRange('193.33.26.0', '193.33.27.255');
whiteList.addRange('193.105.156.0', '193.105.156.255');
whiteList.addRange('195.114.122.0', '195.114.123.255');

module.exports = (r) => ({
    method: "POST",
    url: '/pixels/put',
    schema: {
        body: {
            type: 'object',
            required: ['id', 'color'],
            properties: {
                id: { type: 'number' },
                color: { type: 'string' },
                token: { type: 'string' }
            }
        }
    },
    config: {
        rateLimit: {
            max: 5,
            timeWindow: '1s'
        }
    },
    async preHandler(req, res, done) {
        const user = await rethinkdb
            .db('pixelbattle')
            .table('users')
            .get(req.body.token)
            .run(r);

        if (!user) return res.send({ error: true, reason: "NotAuthorized" });
        if (ended) return res.send({ error: true, reason: "Ended" });
        if (user.cooldown > Date.now()) return res.send({
            error: true,
            reason: "UserCooldown", 
            cooldown: Math.round((user.cooldown - Date.now()) / 1000)
        });

        req.userSession = user;
        done();
    },
    async handler(req, res) {
        const pixelID = req.body.id;
        const color = req.body.color;

        if (!hexRegExp.test(color)) return res.send({ error: true, reason: "IncorrectColor" });

        const pixel = rethinkdb.db('pixelbattle').table('pixels').get(pixelID).run(r);
        if (!pixel) return res.send({ error: true, reason: "IncorrectPixel" });

        let cooldown;
        let ip = req.headers['cf-connecting-ip'] || req.ip;
        let adminCheck = whiteList.check(ip);
        switch (adminCheck) {
            case true:
                cooldown = 0;
                break;

            case false:
                cooldown = Date.now() + cooldownTime;
                break;
        }

        await rethinkdb
            .db('pixelbattle')
            .table('users')
            .get(req.body.token)
            .update({ cooldown })
            .run(r);

        await rethinkdb
            .db('pixelbattle')
            .table('pixels')
            .get(pixelID)
            .update({ color, tag: req.userSession.tag })
            .run(r);

        req.server.websocketServer.clients.forEach((client) =>
            client.readyState === 1 &&
                client.send(JSON.stringify({
                        op: 'PLACE',
                        id: pixelID,
                        color
                    })
                )
        );

        return res.send({ error: false, reason: "Ok" });
    }
});
