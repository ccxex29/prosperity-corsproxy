const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const QueryString = require('querystring');
const axiosRetry = require('axios-retry');

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
            res.status(400).send('Bad Request: Property requirements are not satisfied');

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

        // Login Cookie
        configLogin = await getCookie(loginAddr, loginQuery, configLogin);

        if (!configLogin)
            res.status(500).send('Internal Server Error');
        if (JSON.stringify(configLogin.jar) === JSON.stringify({}))
            res.status(401).send('Could not get cookie. Given userid or pwd may be wrong');


        // Initiate Axios Session
        const sess = axios.create({
            baseURL: baseUrl
        });

        // Set max retry to 10x
        axiosRetry(sess, { retries: 10, retryDelay: axiosRetry.exponentialDelay });

        // Processing Data
        let termListObj = [];
        const clearTargetTerm = () => {
            for (let i = 0; i < termListObj.length; i++) {
                delete requestModel[`SSR_DUMMY_RECV1$sels$${i}$$0`];
            }
        };

        await sess.get(pathUrl,
            configLogin)
            .then(res => {
                const $ = cheerio.load(res.data, {normalizeWhitespace: true});
                const termList = $('#SSR_DUMMY_RECV1\\$scroll\\$0 tbody tr');

                for (let i = 2; i < termList.length; i++) {
                    const termListTrElement = $(termList[i]).find(`#TERM_VAL\\$${ i-2 }`);
                    if (termListTrElement.text().match(/\w+/g)) {
                        termListObj.push({
                            termName: termListTrElement.text(),
                            courseList: []
                        });
                    }
                }
            })
            .catch(err => console.log(new Error(err)));

        try {
            for (let numwhere = 0; numwhere < termListObj.length; numwhere++) {
                // console.log('TERM: ' + termListObj[numwhere].termName);
                const ic = await sess.get(pathUrl,
                    configLogin)
                    .then(res => {
                        const $ = cheerio.load(res.data, { normalizeWhitespace: true });
                        const sid = $('input#ICSID').attr('value');
                        const statenum = $('input#ICStateNum').attr('value');
                        return {
                            sid: sid,
                            statenum: statenum
                        };
                    })
                    .catch(err => console.log(new Error(err)));

                requestModel['ICSID'] = ic.sid;
                requestModel['ICStateNum'] = ic.statenum;
                requestModel['ICAction'] = 'DERIVED_SSS_SCT_SSR_PB_GO';
                clearTargetTerm();
                requestModel[`SSR_DUMMY_RECV1$sels$${numwhere}$$0`] = numwhere;

                await sess.post(pathUrl,
                    QueryString.stringify(requestModel),
                    configLogin)
                    .then( async res => {
                        const $ = cheerio.load(res.data);
                        const courseTable = $('#CLASS_TBL\\$scroll\\$0 tbody tr');
                        requestModel['ICStateNum'] = (parseInt(requestModel['ICStateNum']) + 1).toString();
                        for (let i = 1; i < courseTable.length; i++) {
                            const coursePost = {
                                ...requestModel,
                                "ICAction": `CLASSTITLE$${i-1}`
                            };
                            await sess.post('/psc/ps/EMPLOYEE/HRMS/c/SA_LEARNER_SERVICES.SS_LAM_STD_GR_LST.GBL',
                                QueryString.stringify(coursePost),
                                configLogin)
                                .then(async res => {
                                    const $ = cheerio.load(res.data, { normalizeWhitespace: true, xmlMode: true });
                                    const xmlScript = $('GENSCRIPT#onloadScript');
                                    const courseUri = xmlScript.text().replace(/^.*document\.location='/g, '').replace(/';$/g, '').replace(/^http:\/\/web.academic.uph.edu/g, '');
                                    // console.log(courseUri);
                                    termListObj[numwhere].courseList.push({
                                        courseUri: courseUri,
                                        courseGrade: []
                                    });
                                })
                                .catch(err => console.log(new Error(err)));
                        }
                        for (let i = 1; i < courseTable.length; i++){
                            await sess.get(termListObj[numwhere].courseList[i-1].courseUri, configLogin) // Get Course Details
                                .then(res => {
                                    const $ = cheerio.load(res.data, { normalizeWhitespace: true });
                                    const courseName = $('#DERIVED_SSR_FC_DESCR254');
                                    termListObj[numwhere].courseList[i-1].courseFullName = courseName.text(); // Course Name
                                    const courseGradeRow = $(`#STDNT_GRADE_DTL\\$scrolli\\$0 tbody tr td table.PSLEVEL1GRID tbody tr`);
                                    for (let j = 1; j < courseGradeRow.length; j++){
                                        const courseGradeType = $(courseGradeRow[j]).find(`#CATEGORY\\$${j-1}`);
                                        const courseGradeValue = $(courseGradeRow[j]).find(`#STDNT_GRADE_DTL_STUDENT_GRADE\\$${j-1}`);
                                        termListObj[numwhere].courseList[i-1].courseGrade.push({
                                            courseGradeType: courseGradeType.text(),
                                            courseGradeValue: courseGradeValue.text()
                                        });
                                    }
                                })
                                .catch(err => console.log(new Error(err), termListObj[numwhere].courseList[i-1].courseUri));
                        }
                    })
                    .catch(err => console.log(new Error(err)));
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