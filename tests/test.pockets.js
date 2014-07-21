var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('../lib/adapter')
  , Commands = require('./lib/commands')
  , Queries = require('./lib/queries')
  , Events = require('./lib/events')
  , Interface = require('./lib/interface')
  , Services = require('./lib/services')
  , Wall = require('./lib/models/wall')
  , Pocket = require('./lib/models/pocket');

describe('Managing Pockets', function() {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( 'belt_pocket_management_test', opts);
    var events = new Events();
    var interface = new Interface();
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( events, commands, queries, interface );

    var wall, pocket;
    before(function (done) {
        belt.resource( 'wall', Wall.constructor )
            .schema( Wall.schema )
            .validator( Wall.validator )
            .beforeCreate( Wall.onBeforeCreate )
            .beforeUpdate( Wall.onBeforeUpdate );

        belt.resource( 'pocket', Pocket.constructor )
            .schema( Pocket.schema )
            .validator( Pocket.validator )
            .beforeCreate( Pocket.onBeforeCreate )
            .beforeUpdate( Pocket.onBeforeUpdate );

        services
            .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
            .then(function( resource ) {
                wall = resource;

                return services.addPocket( { preventDefault: function(){}, target: { wall: wall.getId(), title: 'test pocket' } } );
            })
            .then(function( resource ) {
                pocket = resource;

                done();
            })
            .catch( done );
    });

    describe('adding pockets', function() {

        it('adding a pocket to a wall', function( done ) {
            services
                .addPocket( { preventDefault: function(){}, target: { wall: wall.getId(), title: 'test pocket' } } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Pocket );

                    resource.getWall().should.be.equal( wall.getId() );

                    done();
                })
                .catch( done );
        });

    });

    describe('opening pockets for editing', function() {

        it('retreiving all data for displaying a pocket editor', function( done ) {
            var storedId = pocket.getId(), storedTitle = pocket.getTitle();

            services
                .displayPocketEditor( { preventDefault: function(){}, target: { 'data-target': pocket.getId() } } )
                .then(function( response ) {
                    interface.calllist.length.should.be.equal( 1 );

                    interface.calllist[0].call.should.be.equal( 'displayPocketEditor' );

                    var data = interface.calllist[0].data;

                    data.id.should.be.equal( storedId );
                    data.title.should.be.equal( storedTitle );

                    done();
                })
                .catch( done );
        });

    });

    describe('modifying pocket data', function() {

        it('updating one pocket', function( done ) {
            var update = {
                id: pocket.getId()
              , title: 'test pocket modified'
              , wall: pocket.getWall()
            };

            services
                .modifyPocket( { preventDefault: function(){}, target: update } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Pocket );

                    resource.getTitle().should.be.equal( 'test pocket modified' );

                    done();
                })
                .catch( done );
        });

    });

    afterEach(function (done) {
        interface.calllist = [];

        belt.findMany( 'pocket' )
            .then(function( resources ) {
                var promises = [];

                resources.forEach(function( resource ) {
                    if ( resource.getId() !== pocket.getId() ) {
                        promises.push( belt.delete( 'pocket', resource.getId() ) );
                    }
                });

                return RSVP.all( promises );
            })
            .then(function() {
                done();
            })
            .catch( done );
    });

    after(function (done) {

        var removeWalls = belt.findMany( 'wall' )
            .then(function( resources ) {
                var promises = resources.map(function( resource ) {
                    return belt.delete( 'wall', resource.getId() );
                });

                return RSVP.all( promises );
            });

        var removePocket = belt.delete( 'pocket', pocket.getId() );

        RSVP.all( [ removeWalls, removePocket ] )
            .then(function() {
                done();
            })
            .catch( done );
    });

});
