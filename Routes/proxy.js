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

const getCookie = async (targetAddr, loginQuery, configLogin) => { // To be called by post axios method because the client needs to send authentication to proxy
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
            res.status(400).send('Bad Request: Property requirements are not satisfied');
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
        if (JSON.stringify(configLogin.jar) === JSON.stringify({}))
            res.status(401).send('Could not get cookie. Given userid or pwd may be wrong');

        retData = await axios.get(targetAddr, configLogin)
            .then(res => {
                return res.data;
            })
            .catch(err => {
                return 'err'
            });
        if (retData === 'err')
            res.status(500).send('Unable to fetch data!');
        else if (retData)
            res.send(retData);
        else
            res.status(500).send('Unknown Internal Server Error' + configLogin.jar);
    }catch (e) {
        console.log(e);
        res.status(500).send('Internal Server Error\n' + new Error(e))
    }
});

/* Router for special chained data get that also needs GET and POST on the same session
 * Like previous,
 * but there is one site that the requestModel will be used to replace the provided requestModel
 * the mode is only 'default' for now that is for fetching all grades
 */
router.post('/getxmldata', async (req, res) => {
    try {
        if (!req.body.userId || !req.body.pwd || !req.body.mode || !req.body.requestModel || !req.body.pathURL)
            res.status(400).send('Bad Request: Property requirements are not satisfied')

        // Initiate stuffs
        let configLogin = undefined;
        configLogin = resetConfig(configLogin);
        const targetAddr = req.body.site;
        const loginAddr = req.body.loginSite || 'http://web.academic.uph.edu/psp/ps/?cmd=login';
        const baseUrl = req.body.baseURL || 'http://web.academic.uph.edu';
        const pathUrl = req.body.pathURL;
        let requestModel = undefined;
        const loginQuery = QueryString.stringify({
            userid: req.body.userId,
            pwd: req.body.pwd
        });
        if (req.body.mode === 'default')
            requestModel = req.body.requestModel;
        else
            res.status(400).send('Bad Request: Invalid \`mode\` provided. Only \`default\` is currently available');

        // Login
        configLogin = await getCookie(loginAddr, loginQuery, configLogin);
        if (!configLogin)
            res.status(500).send('Internal Server Error');
        if (JSON.stringify(configLogin.jar) === JSON.stringify({}))
            res.status(401).send('Could not get cookie. Given userid or pwd may be wrong');


        // Initiate Axios Session
        const sess = axios.create({
            baseURL: baseUrl
        });

        // Processing Data
        let termListObj = [];
        const clearTargetTerm = () => {
            for (let i = 0; i < termListObj; i++) {
                requestModel[`SSR_DUMMY_RECV1$sels$${i}$$0`] = undefined;
            }
        };

        await sess.get(pathUrl,
            configLogin)
            .then(res => {
                const $ = cheerio.load(res.data, {normalizeWhitespace: true});
                const termList = $('#SSR_DUMMY_RECV1\\$scroll\\$0 tbody tr');

                for (let i = 0; i < termList.length; i++) {
                    const termListTrElement = $(termList[i]).find(`.PSLEVEL2GRIDROW #win0divTERM_VAL\\$${i - 2} #TERM_VAL\\$${i - 2}`);
                    if (termListTrElement.text().match(/\w+/g)) {
                        termListObj.push({
                            termName: termListTrElement.text(),
                            courseList: []
                        });
                    }
                }
            });

        try {
            for (let numwhere = 0; numwhere < termListObj.length; numwhere++) {
                // console.log('TERM: ' + termListObj[numwhere].termName);
                const ic = await sess.get(pathUrl,
                    configLogin)
                    .then(res => {
                        const $ = cheerio.load(res.data, {normalizeWhitespace: true});
                        const sid = $('input[id=\'ICSID\']').attr('value');
                        const statenum = $('input[id=\'ICStateNum\']').attr('value');
                        return {
                            sid: sid,
                            statenum: statenum
                        };
                    })
                    .catch(err => new Error(err));

                requestModel['ICSID'] = ic.sid;
                requestModel['ICStateNum'] = ic.statenum;


                clearTargetTerm();
                requestModel[`SSR_DUMMY_RECV1$sels$${numwhere}$$0`] = numwhere;
                await sess.post(pathUrl,
                    QueryString.stringify(requestModel),
                    configLogin)
                    .then(res => {
                        const $ = cheerio.load(res.data);
                        const courseTable = $('#CLASS_TBL\\$scroll\\$0 tbody tr');
                        for (let i = 0; i < courseTable.length; i++) {
                            const tableRow = $(courseTable[i]).find(`#trCLASS_TBL\\$0_row${i} .PSLEVEL1GRIDROW`);
                            const courseName = $(tableRow).find(`#win0divCLASSTITLE\\$${i - 1} #CLASSTITLE\\$span\\$${i - 1} #CLASSTITLE\\$${i - 1}`);
                            const courseId = $(tableRow).find(`#win0divSS_LAM_CLAS_VW2_CRSE_ID\\$${i - 1} #SS_LAM_CLAS_VW2_CRSE_ID\\$${i - 1}`);
                            if (courseName.text().match(/\w+/g))
                                termListObj[numwhere].courseList.push({
                                    courseId: courseId.text(),
                                    courseName: courseName.text()
                                });
                        }
                    })
                    .catch(err => new Error(err));
            }
            res.send(termListObj);
        } catch (e) {
            console.log(e);
            res.status(500).send('Internal Server Error\n' + new Error(e))
        }
    }catch (e) {
        res.status(500).send('Unknown Internal Server Error');
    }
});

module.exports = router;