module.exports = function( grunt )
{
    "use strict";

    // helper function to load task configs

    function loadConfig( path, config ) {
        var glob = require( 'glob' )
          , object = {}
          , key;

        glob.sync('*', { cwd: path })
            .forEach(function( option ) {
                key = option.replace( /\.js$/, '' );
                object[key] = require( path + option )( config );
            });

        return object;
    }

    // actual config

    var config = {

        pkg: grunt.file.readJSON('package.json')

      , env: process.env

    };

    grunt.util._.extend(config, loadConfig( './tasks/options/', config ));

    grunt.initConfig(config);

    // load grunt tasks
    require('load-grunt-tasks')(grunt);

    // local tasks
    grunt.loadTasks('tasks');




    // clean
    // grunt.registerTask('clean'     , [ 'clean' ]);

    // test
    grunt.registerTask('coverage'     , [ 'clean:coverage', 'blanket', 'copy:coverage', 'mochaTest:instrumented', 'mochaTest:coverage', 'mochaTest:lcov']);
    grunt.registerTask('test'         , [ 'jshint', 'mochaTest:test' ]);

    // auto build
    // grunt.registerTask('default'      , [ 'watch' ]);

    // travis-ci

    grunt.registerTask('ci'     , [ 'test', 'coverage', 'mochaTest:travis-cov', 'coveralls']);

};
