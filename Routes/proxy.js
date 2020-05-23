const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const QueryString = require('querystring');

const toughCookie = require('tough-cookie');
const axiosCookieJar = require('axios-cookiejar-support').default;
const cookieJar = new toughCookie.CookieJar();

axiosCookieJar(axios);

// Common Functionality
const cleanUpConfig = (configLogin) =>{
    delete configLogin.data;
    delete configLogin.url;
    delete configLogin.method;
    return configLogin;
};

const resetConfig = (configLogin) => {
    return {
        withCredentials: true,
        jar: cookieJar,
        crossdomain: true,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36', // Chrome 81 running on macOS Catalina
            'X-Requested-With': 'Prosperity Client',
        }
    };
};

const getCookie = async (targetAddr, loginQuery, configLogin) => {
    return await axios.post(targetAddr, loginQuery, configLogin)
        .then(() => {
            configLogin = cleanUpConfig(configLogin);
            return configLogin;
        })
        .catch(err => {
            new Error(`Error on getCookie\n${err}`);
            return '';
        });
};

/* Router for /getdata which requires full authentication. Workarounds cookie needs and returns all specified data.
 * Requirements to POST include:
 * 1. All 4 JSON Properties: "site", "loginSite" (optional), "userId", "pwd"
 * 2. Correct "userId" and "pwd"
 */
router.post('/getdata', async (req, res) => {
    try {
        if (!(req.body.site) || !(req.body.userId) || !(req.body.pwd))
            res.status(400).send('Bad Request: Property requirements not satisfied');
        let configLogin = undefined;
        configLogin = resetConfig(configLogin);
        const targetAddr = req.body.site;
        const loginAddr = req.body.loginSite || 'http://web.academic.uph.edu/psp/ps/?cmd=login';
        const loginQuery = QueryString.stringify({
            userid: req.body.userId,
            pwd: req.body.pwd
        });

        let retData = {
            studentName: '???',
            studentId: 1337,
            studentGpa: 0.00,
        };

        configLogin = await getCookie(loginAddr, loginQuery, configLogin);
        if (!configLogin)
            res.status(500).send('Internal Server Error');
        if (!configLogin.jar)
            res.status(401).send('Could not get cookie. Given userid or pwd may be wrong');

        retData = await axios.get(targetAddr, configLogin)
            .then(res => {
                // const $ = cheerio.load(res.data, {normalizeWhitespace: true});
                // retData.studentName = $(`#DERIVED_SSTSNAV_PERSON_NAME`).text();
                // retData.studentGpa = $(`#STATS_CUMS\\$13`).text();
                return res.data;
            })
            .catch(err => {
                return 'err'
            });
        if (retData === 'err')
            res.status(500).send('Unable to fetch data!')
        else if (retData)
            res.send(retData);
    }catch (e) {
        console.log(e);
        res.status(500).send('Internal Server Error\n' + new Error(e))
    }
});

module.exports = router;