var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('../lib/adapter')
  , Queue = require('./lib/queue')
  , Commands = require('./lib/commands')
  , Queries = require('./lib/queries')
  , Interface = require('./lib/interface')
  , Services = require('./lib/services')
  , Wall = require('./lib/models/wall')
  , Board = require('./lib/models/board')
  , Region = require('./lib/models/region')
  , Pocket = require('./lib/models/pocket')
  , Card = require('./lib/models/card');

describe('Managing Pockets', function() {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( 'belt_pocket_management_test', opts);
    var queue = new Queue();
    var interface = new Interface( queue );
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( interface, commands, queries );

    var wall, pocket;
    before(function (done) {
        belt.resource( 'wall', Wall.constructor )
            .schema( Wall.schema )
            .validator( Wall.validator )
            .beforeCreate( Wall.onBeforeCreate )
            .beforeUpdate( Wall.onBeforeUpdate );

        belt.schema( 'board', Board.schema )
            .resource( Board.constructor )
            .validator( Board.validator )
            .beforeCreate( Board.onBeforeCreate )
            .beforeUpdate( Board.onBeforeUpdate );

        belt.resource( 'region', Region.constructor )
            .schema( Region.schema )
            .validator( Region.validator )
            .beforeCreate( Region.onBeforeCreate )
            .beforeUpdate( Region.onBeforeUpdate );

        belt.resource( 'pocket', Pocket.constructor )
            .schema( Pocket.schema )
            .validator( Pocket.validator )
            .beforeCreate( Pocket.onBeforeCreate )
            .beforeUpdate( Pocket.onBeforeUpdate );

        belt.resource( 'card', Card.constructor )
            .schema( Card.schema )
            .validator( Card.validator )
            .beforeCreate( Card.onBeforeCreate )
            .beforeUpdate( Card.onBeforeUpdate );

        services
            .createWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
            .then(function( resource ) {
                wall = resource;

                return services.createPocket( { preventDefault: function(){}, target: { wall: wall.getId(), title: 'test pocket' } } );
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
                .createPocket( { preventDefault: function(){}, target: { wall: wall.getId(), title: 'test pocket' } } )
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
                .editPocket( { preventDefault: function(){}, target: { 'data-target': pocket.getId() } } )
                .then(function( pocket ) {
                    pocket.getId().should.be.equal( storedId );
                    pocket.getTitle().should.be.equal( storedTitle );

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
                .updatePocket( { preventDefault: function(){}, target: update } )
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
        queue.clearAll();

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
