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

// ------------
// CORS Configurations
const whitelistOrigin = ['http://localhost:[0-9]{2-5}'];
const corsOptions = {
    origin: true
};

// ------------
// Express Middlewares
app.use(express.json());
app.use(cors(corsOptions));
app.use('/', about);
app.use('/proxy', proxy);



if (app.get('env') === 'development'){
    app.use(morgan('tiny'));
    console.log('Using Morgan...');
}

const port = process.env.PORT || 3005;
app.listen(port, () => console.log(`Listening on port ${port}`));