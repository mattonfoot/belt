
var should = require('chai').should();
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

var PouchDB = require('pouchdb');
var Belt = require('../lib/repository');

var schemas = {
    "person": {
        "name": String,
        "age": Number,
        "birthday": Date,
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

    for ( var name in schemas ) {
        process( name );
    }

    return promises;

    function process( name ) {
        promises.push(new Promise(function( resolve ) {
            belt.schema( name, schemas[ name ], true );

            resolve();
        }));
    }
}

var fixtures = {
  "person": [
    {
      "name": "Jane",
      "age": 21,
      "birthday": new Date( '2013-03-21T00:00:00' )
    },
    {
      "name": "John",
      "age": 42,
      "birthday": new Date( '2010-03-14T00:00:00' )
    },
    {
      "name": "Richard",
      "age": 36,
      "birthday": new Date( '2005-03-07T00:00:00' )
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

    for ( var fixture in fixtures ) {
        process( fixture );
    }

    return RSVP.all( promises );

    function process( fixture ) {
        fixtures[ fixture ].forEach(function( data ) {
            var key = fixture;

            var promise = new Promise(function( resolve, reject ) {
                belt.create( key, data )
                    .then(function( response ) {
                        ids[key] = ids[key] || [];

                        ids[key].push( { id: response.id });

                        resolve();
                    })
                    .catch( reject );
            });

            promises.push( promise );
        });
    }
}


describe('using a repository', function () {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( new PouchDB('belt_repository_test', opts), opts);

    before(function (done) {
        RSVP.all(createRepositories( belt, schemas ))
            .then(function() {
                return createResources( belt, fixtures, ids );
            })
            .then(function() { done(); })
            .catch( done );
    });

    after(function (done) {
        var promises = [];

        for (var key in ids) {
            process( key );
        }

        RSVP.all(promises)
            .then(function () {
                done();
            })
            .catch(function ( error ) {
                throw new Error('Failed to delete resources.');
            });

        function process( key ) {
            ids[key].forEach(function( instance ) {
                promises.push( belt.delete( key, instance.id ) );
            });
        }
    });

    describe('getting all resources', function () {
        for ( var fixture in fixtures ) {
          forFixture( fixture );
        }

        function forFixture( fixture ) {
            it('in collection "' + fixture + '"', function (done) {

                belt.findMany( fixture )
                    .then(function( resources ) {
                        var found = 0;

                        should.exist( resources );

                        ids[fixture].forEach(function ( instance ) {
                            resources.forEach(function( resource ) {
                                resource.should.not.have.property( '_id' );

                                if (resource.id === instance.id) {
                                    found++;
                                }
                            });
                        });

                        found.should.equal( ids[fixture].length );
                    })
                    .then(function() { done(); })
                    .catch( done );
            });
        }
    });

    describe('getting an individual resource', function () {
        for ( var fixture in fixtures ) {
          forFixture( fixture );
        }

        function forFixture( fixture ) {
            it('in collection "' + fixture + '"', function (done) {
                var key = fixture;

                var promises = ids[key].map(function ( instance ) {
                    return belt
                        .find( fixture, instance.id )
                        .then(function( resource ) {
                            should.exist(resource);

                            resource.should.not.have.property( '_id' );
                            resource.id.should.equal( instance.id );
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

    describe('data deserialization', function () {
      it('Correctly deserialize Date values into date objects', function (done) {
          var key = 'person';

          var promises = ids[ key ].map(function ( instance ) {
              return belt
                  .find( key, instance.id )
                  .then(function( resource ) {
                      should.exist(resource);

                      resource.should.have.property( 'birthday' );
                      resource.birthday.should.be.an.instanceOf( Date );
                  });
          });

          RSVP.all(promises)
              .then(function() {
                  done();
              })
              .catch(done);
      });
    });

    describe('one to one association', function () {

        it('link one resource to one other', function (done) {
            var personid = ids.person[0].id
              , partnerid = ids.person[1].id;

            belt.find( 'person' , personid )
                .then(function( resource ) {
                    // associate vehicles with owner

                    resource.id.should.equal( personid );

                    resource.links = {
                        partner: partnerid
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

                    resource.should.have.property( 'links' );
                    resource.links.should.have.property( 'partner' );
                    resource.links.partner.should.equal( partnerid );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.find( 'person', resource.links.partner );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( partnerid );

                    resource.should.have.property( 'links' );
                    resource.links.should.have.property( 'partner' );
                    resource.links.partner.should.equal( personid );

                    done();
                })
                .catch(done);
        });

        it('unlink one resource from one other', function (done) {
            var personid = ids.person[0].id
              , partnerid = ids.person[1].id;

            belt.find( 'person' , personid )
                .then(function( resource ) {
                    // disassociate vehicles with owner

                    resource.id.should.equal( personid );

                    delete resource.links.partner;

                    return belt.update( 'person', personid, resource );
                })
                .then(function( info ) {
                    return belt.find( 'person', info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( personid );

                    resource.should.not.have.property( 'links' );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.findMany( 'person' );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.length.should.not.equal( 0 );
                    resources
                        .forEach(function( resource ) {
                            resource.should.not.have.property( 'links' );
                        });

                    done();
                })
                .catch(done);
        });

    });

    describe('one to many association', function () {

        it('link multiple resources to one resource', function (done) {
            var personid = ids.person[0].id
              , vehicleid = ids.vehicle[0].id
              , allVehicles = ids.vehicle.map(function( instance ) { return instance.id; });

            belt.findMany( 'vehicle' , allVehicles )
                .then(function( resources ) {
                  should.exist(resources);

                  var keys = resources.map(function( resource ) {
                      resource.should.not.have.property( '_id' );
                      resource.should.have.property( 'id' );

                      return resource.id;
                  });

                  function patch( doc ) {
                    doc.owner = personid;

                    return doc;
                  }

                  return belt.patch( 'vehicle', { keys: keys }, patch );
                })
                .then(function( info ) {
                  return belt.findMany( 'vehicle', allVehicles );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.forEach(function( resource ) {
                      resource.should.have.property( 'links' );
                      resource.links.should.have.property( 'owner' );
                      resource.links.owner.should.equal( personid );
                    });
                })
                .then(function( info ) {
                    return belt.find( 'person', personid );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( personid );

                    resource.should.have.property( 'links' );
                    resource.links.should.have.property( 'vehicle' );
                    resource.links.vehicle.should.be.an( 'array' );
                    resource.links.vehicle.length.should.equal( allVehicles.length );
                    allVehicles.forEach(function( id ){
                        resource.links.vehicle.should.include( id );
                    });

                    done();
                })
                .catch(done);
        });

        it('unlink multiple resources from one resource', function (done) {
            var personid = ids.person[0].id
              , vehicleid = ids.vehicle[0].id;

            belt.find( 'person' , personid )
                .then(function( resource ) {
                    resource.id.should.equal( personid );

                    resource.should.have.property( 'links' );
                    resource.links.should.have.property( 'vehicle' );

                    delete resource.links.vehicle;

                    return belt.update( 'person', personid, resource );
                })
                .then(function( info ) {
                    return belt.find( 'person', info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( personid );

                    resource.should.not.have.property( 'links' );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.findMany( 'vehicle' );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.length.should.not.equal( 0 );
                    resources.forEach(function( resource ) {
                      resource.should.not.have.property( 'links' );
                    });

                    done();
                })
                .catch(done);
        });

    });

    describe('many to one association', function () {
        var primaryType = 'person'
          , primaryRelation = 'owner'
          , secondaryType = 'vehicle'
          , secondaryRelation = 'vehicle';

        it('link one resource to multiple resources', function (done) {
            var primaryid = ids.person[0].id
              , secondaryid = ids.vehicle[0].id
              , allSecondaryIds = ids.vehicle.map(function( instance ) { return instance.id; });

            belt.find( primaryType , primaryid )
                .then(function( resource ) {
                    resource.id.should.equal( primaryid );

                    resource.links = {
                        vehicle: allSecondaryIds
                    };

                    return belt.update( primaryType, primaryid, resource );
                })
                .then(function( info ) {
                    return belt.find( primaryType, info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( primaryid );

                    resource.should.have.property( 'links' );
                    resource.links.should.have.property( secondaryRelation );
                    resource.links.vehicle.should.be.an( 'array' );
                    resource.links.vehicle.length.should.equal( allSecondaryIds.length );
                    resource.links.vehicle.should.include( allSecondaryIds[0] );
                    resource.links.vehicle.should.include( allSecondaryIds[allSecondaryIds.length - 1] );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.findMany( secondaryType, resource.links.vehicle );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.forEach(function( resource ) {
                      resource.should.have.property( 'links' );
                      resource.links.should.have.property( primaryRelation );
                      resource.links.owner.should.equal( primaryid );
                    });
                })
                .then(function() {
                    done();
                })
                .catch(done);
        });

        it('unlink one resource to multiple resources', function (done) {
            var primaryid = ids.person[0].id
              , secondaryid = ids.vehicle[0].id;

            belt.find( primaryType , primaryid )
                .then(function( resource ) {
                    resource.id.should.equal( primaryid );

                    delete resource.links.vehicle;

                    return belt.update( primaryType, primaryid, resource );
                })
                .then(function( info ) {
                    return belt.find( primaryType, info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( primaryid );

                    resource.should.not.have.property( 'links' );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.findMany( secondaryType );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.length.should.not.equal( 0 );
                    resources.forEach(function( resource ) {
                      resource.should.not.have.property( 'links' );
                    });
                })
                .then(function() {
                    done();
                })
                .catch(done);
        });

    });

    describe('many to many association', function () {
        it('link multiple resources to multiple other resources', function (done) {
            var everyone = []
              , primaries = []
              , firstPerson;

            ids.person.forEach(function( instance ) {
                var id = instance.id;

                everyone.push( id );

                if (!firstPerson) firstPerson = id;

                if ( id !== firstPerson ) primaries.push( id );
            });

            belt.findMany( 'person', primaries )
                .then(function( resources ) {
                  should.exist(resources);

                  var updates = resources.map(function( resource ) {
                    resource.should.not.have.property( '_id' );
                    resource.should.have.property( 'id' );
                    resource.id.should.not.equal( firstPerson );

                    var others = [];
                    everyone.map(function( id ) { if ( id !== resource.id ) others.push( id ); });

                    resource.links = {
                      sibling: others
                    };

                    return resource;
                  });

                  return belt.updateMany( 'person', updates );
                })
                .then(function( info ) {
                    return belt.findMany( 'person' );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.forEach(function( resource ) {
                      resource.should.have.property( 'links' );
                      resource.links.should.have.property( 'sibling' );

                      resource.links.sibling.should.not.contain( resource.id );
                      resource.links.sibling.should.have.length( everyone.length - 1 );
                    });

                    done();
                })
                .catch(done);

        });

        it('unlink multiple resources from multiple other resources', function (done) {
            var everyone = []
              , primaries = []
              , firstPerson;

            ids.person.forEach(function( instance ) {
                var id = instance.id;

                everyone.push( id );

                if (!firstPerson) firstPerson = id;

                if ( id !== firstPerson ) primaries.push( id );
            });

            belt.findMany( 'person', primaries )
                .then(function( resources ) {
                  should.exist(resources);

                  var updates = resources.map(function( resource ) {
                    resource.should.not.have.property( '_id' );
                    resource.should.have.property( 'id' );
                    resource.id.should.not.equal( firstPerson );

                    resource.should.have.property( 'links' );
                    resource.links.should.have.property( 'sibling' );

                    delete resource.links.sibling;

                    return resource;
                  });

                  return belt.updateMany( 'person', updates );
                })
                .then(function( resource ) {
                  return belt.findMany( 'person' );
                })
                .then(function( resources ) {
                  should.exist(resources);

                  resources.length.should.not.equal( 0 );
                  resources.forEach(function( resource ) {
                    resource.should.not.have.property( 'links' );
                  });

                  done();
                })
                .catch(done);
        });

    });

});
