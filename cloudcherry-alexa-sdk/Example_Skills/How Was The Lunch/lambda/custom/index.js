'use strict';
var Alexa = require('alexa-sdk');
var http = require('https');
const token = process.env.token;


var reply = {
    questionId: null,
    questionText: null,
    textInput: null,
    numberInput: 0
};

var handlers = {
    'LaunchRequest': function () {
        this.response.speak("Hello, I hope you have enjoyed the lunch. If you have something to share with us, you are welcome. "+
        "You may say 'feedback' or 'I want to give feedback' to continue. ")
            .listen("");
        this.emit(':responseReady');

    },
    
    'feedback': function () {
        var attributes = {
            responses: [],
            questionIndex: -1,
            validQuestionsLength: 1000,
            prefills: {},
            token: ''
        }
        attributes.token = token;

        this.attributes.cloudcherry = attributes;
        this.emit('cc_functionalities');

    },
    'cc_functionalities': function () {

        var attributes = this.attributes ? this.attributes.cloudcherry : { 
            responses: [],
            questionIndex: -1,
            validQuestionsLength: 1000,
            prefills: {},
            token: ''
        };
        var that = this;
        var isQuesAsked = false;
        
        //check if 'digit' slot has captured something, if yes then assign it to the numberInput property of the response object

        if (this.event.request.intent.slots && this.event.request.intent.slots.digit && this.event.request.intent.slots.digit.value) {
            if (attributes && attributes.responses.length > 0) {
                attributes.responses[attributes.responses.length - 1].numberInput = parseInt(this.event.request.intent.slots.digit.value, 10);
            } else {
                this.emit('AMAZON.HelpIntent');
                return false;
            }
        }

        //check if 'text' slot has captured something, if yes then assign it to the textInput property of the response object

        else if (this.event.request.intent.slots && this.event.request.intent.slots.text && this.event.request.intent.slots.text.value) {
            if (attributes && attributes.responses.length > 0) {
                attributes.responses[attributes.responses.length - 1].textInput = this.event.request.intent.slots.text.value;
            } else {
                this.emit('AMAZON.HelpIntent');
                return false;
            }
        }
        
        // getQuest makes a 'GET' call to the CloucCherry API and fetches the JSON object containing questions configured

        getQuest(that, attributes, function (that, attributes, settings, err) {
            if (err) {
                console.error(err);
            } else {
                var validQuestions = getValidQuestions(settings);
                if (validQuestions && validQuestions.length > 0) {
                    var j = attributes.questionIndex + 1;                         // questionIndex is the index of last question fetched
                    attributes.validQuestionsLength = validQuestions.length;

                    while (j < validQuestions.length) {
                        var question = validQuestions[j];
                        attributes.responses.push({
                            questionText: question.text,
                            questionId: question.id,
                            textInput: null,
                            numberInput: 0
                        });

                        if (!attributes || !attributes.prefills || !attributes.prefills[question.id]) {
                            attributes.questionIndex = j;
                            that.attributes.cloudcherry = attributes;
                            isQuesAsked = true;                                   /* isQuesAsked ensured that if question is asked by Alexa 
                                                                                     then wait for a response and do not make a 'POST' call*/
                            that.response.speak(question.text).listen("Please");      
                            that.emit(":responseReady");
                            break;
                        } else {
                            var answer = attributes.prefills[question.id];
                            if (isNaN(answer)) {                                   // checking if 'answer' is numeric or not
                                attributes.responses[attributes.responses.length - 1].textInput = answer;
                            } else {
                                attributes.responses[attributes.responses.length - 1].numberInput = answer;
                            }
                            attributes.questionIndex = j;
                            that.attributes.cloudcherry = attributes;
                            j++;
                        }
                    }
                    if (!isQuesAsked && attributes.questionIndex === attributes.validQuestionsLength - 1) {
                        that.attributes.cloudcherry = attributes;
                        sendAnswer(that, attributes);
                   }
                    
                } else {
                    that.attributes.cloudcherry = null;
                    that.response.speak("Invalid");
                    that.emit(':responseReady');
                }

            }
        });
        

    },

    // this intent trigerred if the 'intent invocation' does not match 

    'AMAZON.FallbackIntent': function () {                                                  
        this.response.speak("Oops! Something went wrong. Please try again.");
        this.emit(':responseReady');

    },
    'AMAZON.StopIntent': function () {
        this.attributes.cloudcherry = null;
        this.response.speak("Goodbye! See you again.")
        this.emit(':responseReady');
    },
    'AMAZON.HelpIntent': function () {
        this.atributes.cloudcherry = null;
        this.response.speak("Please use a statement to order beverages");
        this.emit(':responseReady');
    },
    'AMAZON.YesIntent': function () {
        this.emit('feedback');
    },
    'AMAZON.NoIntent': function () {
        this.response.speak("Thank you for your time");
        this.emit(':responseReady');
    }
}

function getQuest(that, attributes, callback) {

    var url = "https://api.getcloudcherry.com/api/surveybytoken/" + attributes.token;
    console.log(url);
    var req = http.get(url, function (res) {
        var body = "";
        res.on('data', function (response) {
            body += response;
        });
        res.on('end', function () {
            body = body.replace(/\\/g, '');
            var settings = JSON.parse(body);
            callback(that, attributes, settings)
        });

    });
    req.on('error', function (err) {
        callback('', err);
    });
}

// sendAnswer makes a 'POST' call to the cloudcherry API when all responses have been received

function sendAnswer(that, attributes) {
    var path = '/api/SurveyByToken/' + attributes.token;
    var jsonObject = JSON.stringify({
        "id": null,
        "locationId": null,
        "responseDuration": 0,
        "responseDateTime": null,
        "responses": attributes.responses,
        "surveyClient": "Alexa"
    });
    var postheaders = {
        'Content-type': 'application/json'
    };
    var optionspost = {
        host: 'api.getcloudcherry.com',
        port: 443,
        path: path,
        method: 'POST',
        headers: postheaders
    };
    var reqPost = http.request(optionspost, function (res) {
        var str = '';
        res.on('data', function (chunk) {
            str += chunk;
        });
        res.on('end', function () { 
            that.response.speak("Does someone want to give a feedback?").listen();
            that.emit(':responseReady');
        });

    });
    reqPost.on('error', function (e) {
        console.log('post error')
        console.error(e);

    });
    reqPost.end(jsonObject);

}

// fetching the configured questions in the Cloudcherry questionairre

function getValidQuestions(settings) {
    if (settings && settings.questions && settings.questions.length > 0) {
        var validQuestions = settings.questions.filter((p) => !p.apiFill && !p.staffFill && !p.isRetired);
        validQuestions = validQuestions.sort((a, b) => a.sequence - b.sequence);  /* sort the questions on the basis of thier sequence
                                                                                     in the questionairre*/           
        return validQuestions;
    } else {
        return null;
    }
}

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.registerHandlers(handlers);
    alexa.execute();
};