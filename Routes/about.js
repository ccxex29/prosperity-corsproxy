const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('index', {
        title: "A little message",
        messageHead: "Hello There... Here's how you may access this server",
        messageBody: "This server is supposed to be accessed via Prosperity Client. ",
        messageBodyDesc: "This server essentially only acts as a proxy between UPH Academic Server and Prosperity Client to avoid CORS problems.",
        messageDir: "/proxy/getdata can be used to put sub-addresses and act as a bridge to GET or POST to http://web.academic.uph.edu/",
        messageFrom: req.params
    });
});

module.exports = router;