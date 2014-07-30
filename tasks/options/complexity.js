module.exports = function( config ) {

    return {
        all: {

            src: [ 'lib/**/*.js' ],
        //  exclude: [ 'doNotTest.js' ],
            options: {
                breakOnErrors: true
              , jsLintXML: 'reports/report.xml'         // create XML JSLint-like report
              , checkstyleXML: 'reports/checkstyle.xml' // create checkstyle report
              , errorsOnly: false               // show only maintainability errors
              , cyclomatic: [3, 7, 12]          // or optionally a single value, like 3
              , halstead: [8, 13, 20]           // or optionally a single value, like 8
              , maintainability: 100
              , hideComplexFunctions: false      // only display maintainability
              , broadcast: false                 // broadcast data over event-bus
            }
        }
    };

};
