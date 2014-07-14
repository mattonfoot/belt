var should = require('chai').should();
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

var Belt = require('../lib/index.js');

var schemas = {
    "person": {
        "name": String,
        "age": Number,
        "vehicle": [ "vehicle" ],
        "partner": { ref: 'person', inverse: 'partner' },
        "sibling": [{ ref: 'person', inverse: 'sibling' }]
    },
    "vehicle": {
        "model": String,
        "age": Number,
        "owner": "person"
    }
};

// create repositories
function createRepositories( belt, schemas ) {
    var promises = [];

    for ( schema in schemas ) {
        promises.push(new Promise(function( resolve ) {
            belt.schema( schema, schemas[ schema ] );

            resolve();
        }));
    }

    return promises;
}

var fixtures = {
  "person": [
    {
      "name": "Dilbert",
      "age": 21
    },
    {
      "name": "Wally",
      "age": 42
    }
  ],
  "vehicle": [
    {
      "model": "White van",
      "age": 3
    },
    {
      "model": "Sports car",
      "age": 10
    }
  ]
};

// create resources
function createResources( belt, fixtures, ids ) {
    var promises = [];

    for ( fixture in fixtures ) {
        fixtures[ fixture ].forEach(function( data ) {
            promises.push(new Promise(function( resolve ) {
                var key = fixture;

                belt.create( key, data )
                    .then(function( response ) {
                        ids[key] = ids[key] || [];

                        ids[key].push( { id: response.id, rev: response.rev });

                        resolve();
                    });
            }));
        });
    }

    return promises;
}


describe('using an adapter', function () {
    var ids = {};
    var belt = new Belt({ db : require('memdown') });

    before(function (done) {
        RSVP.all(createRepositories( belt, schemas ))
            .then(function() { return RSVP.all(createResources( belt, fixtures, ids )); })
            .then(function () {
                done();
            })
            .catch(function( error ) {
                throw new Error('Failed to initialize adapter.');
            });
    });

    describe('getting a list of resources', function () {
      for ( var fixture in fixtures ) {
          it('in collection "' + fixture + '"', function (done) {

              belt.all( fixture )
                  .then(function( resources ) {
                      var found = 0;

                      ids[fixture].forEach(function ( instance ) {
                          resources.forEach(function( resource ) {
                              if (resource.id === instance.id) {
                                  found++;
                              }
                          });
                      });

                      found.should.equal( ids[fixture].length );

                      done();
                  }, done);
          });
      }
    });

    /*

    describe('getting each individual resource', function () {

        it('in collection one', function (done) {
            // test that the resource is correct and valid

            // test there is no error

            done();
        });

    });

    describe('many to one association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    describe('one to many association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    describe('one to one association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    describe('many to many association', function () {

        it('should be able to associate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    */

    after(function (done) {
        // delete all resources in the repositories

        /*
        RSVP.all(ids[key].map(function (id) {
        })).then(function () {
          done();
        }, function () {
          throw new Error('Failed to delete resources.');
        });
        */

        done();
    });

});
