module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Card:Move', function() {

        describe('Moving a card on an empty board', function() {
            var storedId, storedWallId, storedLocationId
              , storedTitle = 'card for moving'
              , destination = { x: 200, y: 200 };

            it('Updates the location', function(done) {
                application.pauseListenting();

                services
                    .createWall( { name: 'card movement wall' } )
                    .then( displayNewWall )
                    .then( addBoardToNewWall )
                    .then( addPocketToNewWall )
                    .catch( done );

                function displayNewWall( wall ) {
                    storedWallId = wall.getId();

                    return services.displayWall( storedWallId );
                }

                function addBoardToNewWall( wall ) {
                    return services
                        .createBoard( { wall: storedWallId, name: 'card movement board' } );
                }

                function addPocketToNewWall() {
                    application.startListening();

                    queue.on('cardlocation:created', startFixture );

                    return services
                        .createPocket( { wall: storedWallId, title: storedTitle } )
                        .then(function( pocket ) {
                            storedId = pocket.getId();
                        });
                }

                function startFixture( location ) {
                    should.exist( location );

                    location.should.respondTo( 'getId' );
                    location.should.respondTo( 'getPocket' );
                    location.getPocket().should.be.equal( storedId );

                    storedLocationId = location.getId();

                    queue.clearCalls();

                    queue.once( 'cardlocation:updated', endFixture);

                    location.x = destination.x;
                    location.y = destination.y;

                    queue.trigger( 'cardlocation:move', location);
                }

                function endFixture( location ) {
                    should.exist( location );

                    location.should.respondTo( 'getId' );
                    location.getId().should.be.equal( storedLocationId );
                    location.should.respondTo( 'getX' );
                    location.getX().should.be.equal( destination.x );
                    location.should.respondTo( 'getY' );
                    location.getY().should.be.equal( destination.y );

                    var calls = queue.getCalls();

                    calls.length.should.be.above( 1 );

                    calls[0].event.should.be.equal( 'cardlocation:move' );
                    calls[1].event.should.be.equal( 'cardlocation:updated' );

                    done();
                }
            });

        });
/*
        describe('Moving a card on an empty board', function() {
            var storedId, storedWallId, storedLocationId
              , storedTitle = 'card for moving'
              , destination = { x: 200, y: 200 }
              , regionSize = { x: 100, y: 100, width: 200, height: 200 }
              , board;

            it('Updates the location', function(done) {
                application.pauseListenting();

                services
                    .createWall( { name: 'card movement wall' } )
                    .then( displayNewWall )
                    .then( addBoardToNewWall )
                    .then( addRegionToNewWall )
                    .then( addPocketToNewWall )
                    .catch( done );

                function displayNewWall( wall ) {
                    storedWallId = wall.getId();

                    return services.displayWall( storedWallId );
                }

                function addBoardToNewWall( wall ) {
                    return services
                        .createBoard( { wall: storedWallId, name: 'card movement board' } )
                        .then(function( resource ) {
                            board = resource;
                        });
                }

                function addRegionToNewWall() {
                    return services
                        .createRegion( { board: board.getId(), label: 'red region', color: 'red region' } )
                        .then(function( pocket ) {
                            storedId = pocket.getId();
                        });
                }

                function addPocketToNewWall() {
                    application.startListening();

                    queue.on('cardlocation:created', startFixture );

                    return services
                        .createPocket( { wall: storedWallId, title: storedTitle } )
                        .then(function( pocket ) {
                            storedId = pocket.getId();
                        });
                }

                function startFixture( location ) {
                    should.exist( location );

                    location.should.respondTo( 'getId' );
                    location.should.respondTo( 'getPocket' );
                    location.getPocket().should.be.equal( storedId );

                    storedLocationId = location.getId();

                    queue.clearCalls();

                    queue.once( 'cardlocation:updated', endFixture);

                    location.x = destination.x;
                    location.y = destination.y;

                    queue.trigger( 'cardlocation:move', location);
                }

                function endFixture( location ) {
                    should.exist( location );

                    location.should.respondTo( 'getId' );
                    location.getId().should.be.equal( storedLocationId );
                    location.should.respondTo( 'getX' );
                    location.getX().should.be.equal( destination.x );
                    location.should.respondTo( 'getY' );
                    location.getY().should.be.equal( destination.y );

                    var calls = queue.getCalls();

                    calls.length.should.be.above( 1 );

                    calls[0].event.should.be.equal( 'cardlocation:move' );
                    calls[1].event.should.be.equal( 'cardlocation:updated' );

                    done();
                }
            });
        });
*/
    });

};
