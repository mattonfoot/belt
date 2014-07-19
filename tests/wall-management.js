var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('../lib/adapter')
  , Commands = require('./commands')
  , Queries = require('./queries')
  , Events = require('./events')
  , Interface = require('./interface')
  , Services = require('./services');

// modelfactory

function Wall( data ) {
    this.id = data.id;
    this.name = data.name;
    this.getId = function() { return data.id; };
    this.getName = function() { return data.name; };
}

var WallFactory = {

    constructor: function( data ) {
        if ( data instanceof Wall ) {
            return data;
        }

        return new Wall( data );
    }

  , schema:  {
        name: String
      , boards: ['board']
      , pockets: ['pocket']
      , createdBy: 'user'
      , createdOn: Date
      , lastModifiedBy: 'user'
      , lastModifiedOn: Date
      // , access: [ 'right' ] --> 'user', 'group'
    }

  , validator: function( data ) {
        var validator = {
            validForUpdate: true
          , validForCreate: true
          , issues: []
        };

        if ( !data._id ) {
            validator.validForUpdate = false;
            validator.issues.push( 'ID is required' );
        }

        if ( !data.name || data.name === '' ) {
            validator.validForUpdate = validator.validForCreate = false;
            validator.issues.push( 'Name is required' );
        }

        return validator;
    }

  , onBeforeUpdate: function ( data ) {
        // data.lastModifiedBy = app.getCurrentUser()._id;
        data.lastModifiedOn = new Date();

        return data;
    }

  , onBeforeCreate: function( data ) {
        // data.createdBy = app.getCurrentUser()._id;
        data.createdOn = new Date();

        return data;
    }

};






// tests


describe('Managing Walls', function() {
    var ids = {};
    var belt = new Belt( 'belt_wall_management_test', { db: require('memdown') });
    var events = new Events();
    var interface = new Interface();
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( events, commands, queries, interface );

    before(function () {
        belt.resource( 'wall', WallFactory.constructor )
            .schema( WallFactory.schema )
            .validator( WallFactory.validator )
            .beforeCreate( WallFactory.onBeforeCreate )
            .beforeUpdate( WallFactory.onBeforeUpdate );
    });

    describe('adding walls', function() {

        it('adding one wall', function( done ) {
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Wall );

                    done();
                })
                .catch( done );
        });

    });

    describe('listing walls', function() {

        it('listing all walls for display in selector', function( done ) {
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall one' } } )
                .then(function() {
                      return services.addWall( { preventDefault: function(){}, target: { name: 'test wall two' } } );
                })
                .then(function() {
                      return services.addWall( { preventDefault: function(){}, target: { name: 'test wall three' } } );
                })
                .then(function( wall ) {
                      return services.openWallSelector( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } );
                })
                .then(function( response ) {
                    should.exist( response );
                    should.exist( response.openWallSelector, 'correct function called' );
                    should.exist( response.data, 'data passed back' );

                    response.openWallSelector.should.equal( true );

                    response.data.length.should.be.equal( 3 );

                    response.data.forEach(function( resource ) {
                        resource.should.be.instanceOf( Wall );
                    });

                    done();
                })
                .catch( done );
        });

    });
/*
    describe('displaying walls', function() {

        it('all boards on a wall', function( done ) {
        });

        it('all boards on a wall', function( done ) {
        });

    });
*/
    describe('opening walls for editing', function() {
        var storedId, storedName;

        it('retreiving all data for displaying a wall editor', function( done ) {
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( wall ) {
                    storedId = wall.getId();
                    storedName = wall.getName();

                    return services.displayWallEditor( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } );
                })
                .then(function( response ) {
                    should.exist( response );
                    should.exist( response.displayWallEditor, 'correct function called' );
                    should.exist( response.data, 'data passed back' );

                    response.displayWallEditor.should.equal( true );

                    response.data.id = storedId;
                    response.data.name = storedName;

                    done();
                })
                .catch( done );
        });

    });
/*
    describe('modifying wall data', function() {

        it('success', function( done ) {
        });

    });
*/
    afterEach(function (done) {
        queries.getAllWalls()
            .then(function( resources ) {
                var promises = resources.map(function( resource ) {
                    return belt.delete( 'wall', resource.getId() );
                });

                RSVP.all( promises )
                    .then(function () {
                        return queries.getAllWalls();
                    })
                    .then(function( resources ) {
                        done();
                    })
                    .catch( done );
            });
    });

});
