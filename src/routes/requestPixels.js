const rethinkdb = require('rethinkdb');

module.exports = (r) => ({
    method: "GET",
    url: '/pixels/get',
    schema: {},
    config: {
        rateLimit: {
            max: 3,
            timeWindow: '1s'
        }
    },
    async handler(_, res) {
        const pixels = await (await rethinkdb
            .db('pixelbattle')
            .table('pixels')
            .run(r))
        .toArray();

        return res.send({ pixels });
    }
});