var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , TestQueue = require('./lib/queue.extensions')
  , Application = require('./lib/application')
  , UI = require('./lib/interface');

var debug = false;

var queue = new TestQueue({ debug: debug });
var ui = new UI( queue );
var application = new Application( queue, ui, { debug: debug } );
var belt = application.belt;
var services = application.services;

/*
  WALL --> NEW, CREATE, DISPLAY, SELECT, EDIT, UPDATE

  BOARD --> NEW, CREATE, DISPLAY, SELECT, EDIT, UPDATE

  CARD --> NEW, CREATE, EDIT, UPDATE, MOVE

  REGION --> NEW, CREATE, EDIT, UPDATE, MOVE, UPDATE

  TRANSFORM --> UNLINK
*/

var _this = this;

var features = [
    'wall.new'
  , 'wall.create'
  , 'wall.select'
  , 'wall.display'
  , 'wall.edit'
  , 'wall.update'
  , 'board.new'
  , 'board.create'
//, 'board.select'
  , 'board.display'
  , 'board.edit'
  , 'board.update'
  , 'card.move'
];

describe('Features', function() {

    features.forEach(function( namespace ) {
        var feature = require( './features/' + namespace );

        feature( should, RSVP, Promise, debug, queue, ui, application, belt, services );
    });

    afterEach(function (done) {
        if (debug || this.currentTest.state === 'failed') console.log( queue.getCalls() );

        var promises =[];

        [ 'region', 'cardlocation', 'pocket', 'board', 'wall' ]
            .forEach(function( schema ) {
                var promise = belt.findMany( schema )
                    .then(function( resources ) {
                        if (!resources.length) return;

                        var promises = resources.map(function( resource ) {
                            return new Promise(function(resolve, reject) {
                                belt.delete( schema, resource.getId() )
                                    .then(function() {
                                        resolve();
                                    })
                                    .catch( reject );
                            });
                        });

                        return RSVP.all( promises );
                    });

                promises.push( promise );
            });

        RSVP.all( promises )
            .then(function() {
                queue.clearCalls();
                application.startListening();

                done();
            })
            .catch( done );
    });

});
