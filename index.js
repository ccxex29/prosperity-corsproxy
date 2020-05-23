// Dependencies
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
// ------------
// Components
const about = require('./Routes/about');
const proxy = require('./Routes/proxy');

const app = express();

app.set('view engine', 'pug');
app.set('views', './Views');

app.use(express.json());
app.use(cors());
app.use('/', about);
app.use('/proxy', proxy);

const whitelistOrigin = ['http://localhost:3000'];
const corsOptions = {
    origin: (origin, callback) => {
        if (whitelistOrigin.indexOf(origin) !== -1)
            callback(null, true)
        else
            callback(new Error('Not allowed by CORS'))
    }
};
app.use(cors(corsOptions));

if (app.get('env') === 'development'){
    app.use(morgan('tiny'));
    console.log('Using Morgan...');
}

const port = process.env.PORT || 3005;
app.listen(port, () => console.log(`Listening on port ${port}`));