module.exports = function( config ) {

    return {

        src: {
            files: 'lib/**/*.js',
            tasks: [ 'test', 'build' ]
        }

      , test: {
            files: 'test/**/*.js',
            tasks: [ 'test' ]
        }
    };

};
