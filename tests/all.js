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
            var key = fixture;

            promises.push(
                belt.create( key, data )
                    .then(function( response ) {
                        ids[key] = ids[key] || [];

                        ids[key].push( { id: response.id, rev: response.rev });
                    })
            );
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

    describe('getting all resources', function () {
      for ( var fixture in fixtures ) {
          it('in collection "' + fixture + '"', function (done) {

              belt.findMany( fixture )
                  .then(function( resources ) {
                      var found = 0;

                      should.exist( resources );

                      ids[fixture].forEach(function ( instance ) {
                          resources.forEach(function( resource ) {
                              resource.should.not.have.property( '_id' );
                              resource.should.not.have.property( '_rev' );

                              if (resource.id === instance.id && resource.rev === instance.rev) {
                                  found++;
                              }
                          });
                      });

                      found.should.equal( ids[fixture].length );

                      done();
                  })
                  .catch(done);
          });
      }
    });

    describe('getting an individual resource', function () {

        for ( var fixture in fixtures ) {
            it('in collection "' + fixture + '"', function (done) {
                var key = fixture;

                var promises = ids[key].map(function ( instance ) {
                    return belt
                        .find( fixture, instance.id )
                        .then(function( resource ) {
                            should.exist(resource);

                            resource.should.not.have.property( '_id' );
                            resource.id.should.equal( instance.id );

                            resource.should.not.have.property( '_rev' );
                            resource.rev.should.equal( instance.rev );
                        });
                });

                RSVP.all(promises)
                    .then(function() {
                        done();
                    })
                    .catch(done);
            });
        }

    });

    describe('many to one association', function () {

        it('should be able to associate', function (done) {
            var personid = ids.person[0].id
              , personrev = ids.person[0].rev
              , vehicleid = ids.vehicle[0].id
              , vehiclerev = ids.vehicle[0].rev;

            belt.find( 'person' , personid )
                .then(function( resource ) {
                    // associate vehicles with owner

                    resource.id.should.equal( personid );

                    resource.links = {
                        vehicle: ids.vehicle.map(function( instance ) { return instance.id })
                    };

                    return belt.update( 'person', personid, resource );
                })
                .then(function( info ) {
                    return belt.find( 'person', info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( personid );

                    resource.should.not.have.property( '_rev' );
                    resource.rev.should.not.equal( personrev );

                    resource.should.have.property( 'links' );
                    resource.links.should.have.property( 'vehicle' );
                    resource.links.vehicle.should.be.an( 'array' );
                    resource.links.vehicle.length.should.equal( ids.vehicle.length );
                    resource.links.vehicle.should.include( ids.vehicle[0].id );
                    resource.links.vehicle.should.include( ids.vehicle[ids.vehicle.length - 1].id );
                })
                .then(function( resource ) {
                    return belt.findMany( 'vehicle', resource.links.vehicle );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.forEach(function( resource ) {
                        resource.should.have.property( 'links' );
                        resource.links.should.have.property( 'owner' );
                        resource.links.owner.should.equal( personid );
                    });

                    done();
                })
                .catch(done);
        });

        it('should be able to dissociate', function (done) {
            // test that the resource is correct and valid

            // test that all referenc3d links are correct

            // test there is no error

            done();
        });

    });

    /*

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
        var promises = [];

        for (var key in ids) {
            ids[key].forEach(function( instance ) {
                promises.push( belt.delete( key, instance.id ) );
            });
        }

        RSVP.all(promises)
            .then(function () {
                done();
            })
            .catch(function ( error ) {
                throw new Error('Failed to delete resources.');
            });
    });

});
