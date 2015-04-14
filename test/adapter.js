
var should = require('chai').should();
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

var PouchDB = require('pouchdb');
var Belt = require('../lib/');

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

var factories = {

  "person": function( data ) {
    var thing = {};

    for ( var prop in data ) {
      if ( prop === 'links' ) continue;

      thing[prop] = data[ prop ];
    }

    for ( var link in data.links ) {
      thing[link] = data.links[ link ];
    }

    return thing;
  },

  "vehicle": function( data ) {
    var thing = {};

    for ( var prop in data ) {
      if ( prop === 'links' ) continue;

      thing[prop] = data[ prop ];
    }

    for ( var link in data.links ) {
      thing[link] = data.links[ link ];
    }

    return thing;
  }

};

var validators = {

  "person": function( data ) {
    var validator = {
      validForUpdate: true,
      validForCreate: true,
      issues: []
    };

    if ( !data.id ) {
      validator.validForUpdate = false;
      validator.issues.push( 'ID is required' );
    }

    if ( !data.name || data.name === '' ) {
      validator.validForUpdate = validator.validForCreate = false;
      validator.issues.push( 'Name is required' );
    }

    return validator;
  },

  "vehicle": function( data ) {
    var validator = {
      validForUpdate: true,
      validForCreate: true,
      issues: []
    };

    if ( !data.id ) {
      validator.validForUpdate = false;
      validator.issues.push( 'ID is required' );
    }

    if ( !data.model || data.model === '' ) {
      validator.validForUpdate = validator.validForCreate = false;
      validator.issues.push( 'Model are required' );
    }

    return validator;
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
          belt
            .resource( name, factories[ name ] )
            .schema( schemas[ name ] )
            .validator( validators[ name ] );

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


describe('using the Adapter', function () {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
      opts.db = require('memdown');
    }

    var belt = new Belt( new PouchDB('belt_adapter_test', opts), opts);

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

                    resource.partner = partnerid;

                    return belt.update( 'person', resource );
                })
                .then(function( info ) {
                    return belt.find( 'person', info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( personid );

                    resource.should.have.property( 'partner' );
                    resource.partner.should.equal( partnerid );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.find( 'person', resource.partner );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( partnerid );

                    resource.should.have.property( 'partner' );
                    resource.partner.should.equal( personid );

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

                    delete resource.partner;

                    return belt.update( 'person', resource );
                })
                .then(function( info ) {
                    return belt.find( 'person', info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( personid );

                    resource.should.not.have.property( 'partner' );

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
                            resource.should.not.have.property( 'partner' );
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

                    var updates = resources.map(function( resource ) {
                      resource.should.not.have.property( '_id' );
                      resource.should.have.property( 'id' );

                      resource.owner = personid;

                      return resource;
                    });

                    return belt.update( 'vehicle', updates[0] )
                      .then(function() {
                        return belt.update( 'vehicle', updates[1] );
                      });
                })
                .then(function( info ) {
                    return belt.findMany( 'vehicle', allVehicles );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources
                        .forEach(function( resource ) {
                            resource.should.have.property( 'owner' );
                            resource.owner.should.equal( personid );
                        });
                })
                .then(function( info ) {
                    return belt.find( 'person', personid );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( personid );

                    resource.should.have.property( 'vehicle' );
                    resource.vehicle.should.be.an( 'array' );
                    resource.vehicle.length.should.equal( allVehicles.length );
                    allVehicles.forEach(function( id ){
                        resource.vehicle.should.include( id );
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

                    delete resource.vehicle;

                    return belt.update( 'person', resource );
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
                    resources
                        .forEach(function( resource ) {
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

                    resource.vehicle = allSecondaryIds;

                    return belt.update( primaryType, resource );
                })
                .then(function( info ) {
                    return belt.find( primaryType, info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( primaryid );

                    resource.should.have.property( secondaryRelation );
                    resource.vehicle.should.be.an( 'array' );
                    resource.vehicle.length.should.equal( allSecondaryIds.length );
                    resource.vehicle.should.include( allSecondaryIds[0] );
                    resource.vehicle.should.include( allSecondaryIds[allSecondaryIds.length - 1] );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.findMany( secondaryType, resource.vehicle );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources
                        .forEach(function( resource ) {
                            resource.should.have.property( primaryRelation );
                            resource.owner.should.equal( primaryid );
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

                    delete resource.vehicle;

                    return belt.update( primaryType, resource );
                })
                .then(function( info ) {
                    return belt.find( primaryType, info.id );
                })
                .then(function( resource ) {
                    should.exist(resource);

                    resource.should.not.have.property( '_id' );
                    resource.id.should.equal( primaryid );

                    resource.should.not.have.property( 'vehicle' );
                    resource.should.not.have.property( 'partner' );
                    resource.should.not.have.property( 'sibling' );

                    return resource;
                })
                .then(function( resource ) {
                    return belt.findMany( secondaryType );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.length.should.not.equal( 0 );
                    resources
                        .forEach(function( resource ) {
                          resource.should.not.have.property( 'owner' );
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

                        resource.sibling = others;

                        return resource;
                    });

                    return belt.update( 'person', updates[0] )
                        .then(function() {
                          return belt.update( 'person', updates[1] );
                        });
                })
                .then(function( info ) {
                    return belt.findMany( 'person' );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources
                        .forEach(function( resource ) {
                            resource.should.have.property( 'sibling' );
                            resource.sibling.length.should.equal( everyone.length - 1 );
                            resource.sibling.should.not.contain( resource.id );
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

                        resource.should.have.property( 'sibling' );

                        delete resource.sibling;

                        return resource;
                    });

                    return belt.update( 'person', updates[0] )
                        .then(function() {
                          return belt.update( 'person', updates[1] );
                        });
                })
                .then(function( resource ) {
                    return belt.findMany( 'person' );
                })
                .then(function( resources ) {
                    should.exist(resources);

                    resources.length.should.not.equal( 0 );
                    resources
                        .forEach(function( resource ) {
                            resource.should.not.have.property( 'sibling' );
                        });

                    done();
                })
                .catch(done);
        });

    });

});
