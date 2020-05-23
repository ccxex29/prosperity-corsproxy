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
    credentials: true,
    origin: (origin, callback) => {
        if (whitelistOrigin.includes(origin))
            callback(null, true)
        else {
            callback(new Error(`${origin} is not allowed`));
        }
    }
};
app.use(cors(corsOptions));

if (app.get('env') === 'development'){
    app.use(morgan('tiny'));
    console.log('Using Morgan...');
}

const port = process.env.PORT || 3005;
app.listen(port, () => console.log(`Listening on port ${port}`));