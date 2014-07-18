var PouchDB = require('pouchdb')
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Model = require('../lib/model');

var db = new PouchDB( 'benchmark_put', { db: require('memdown') })
  , model = new Model( db, 'puts' );

var objects = 100
  , samples = 100
  , maxTime = 10; // secs

module.exports = {
    name: '[POST]ing ' + objects + ' documents into store'

  , tests: {

        '[POST] each document individually': {
            defer: true
          , async: true
          , initCount: samples
          , maxTime: maxTime

          , fn: function( deferred ) {
                var i = 0, promises = [];

                while( i < objects ) {
                    var promise = new Promise(function( resolve, reject ) {
                        model.post( { name: 'benchmark_put_' + i }, function( error, response ) {
                            if (error) return reject( error );

                            resolve( response );
                        });
                    });

                    promises.push( promise );

                    i++;
                }

                RSVP.all( promises )
                    .then(function () {
                        deferred.resolve();
                    }, function ( errors ) {
                        deferred.reject();
                    });
            }
        }

      , '[POST] all documents together': {
            defer: true
          , async: true
          , initCount: samples
          , maxTime: maxTime

          , fn: function( deferred ) {
                var i = 0, updates = [];

                while( i < objects ) {
                    var update = { name: 'benchmark_putmany_' + i };

                    updates.push( update );

                    i++;
                }

                new Promise(function( resolve, reject ) {
                    model.postMany( updates, function( error, response ) {
                        if (error) return reject( error );

                        resolve( response );
                    });
                })
                .then(function () {
                    deferred.resolve();
                }, function ( error ) {
                    deferred.reject();
                });
            }
        }

    }

};
