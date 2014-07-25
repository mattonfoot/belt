module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Board:Create', function() {

        describe('Triggering the creation of a board', function() {

            it('When the wall has no cards', function( done ) {
                var storedId, storedName = 'new board';

                application.pauseListenting();

                services
                    .createWall( { name: 'wall for new board' } )
                    .then( onWallCreated )
                    .then( onWallDisplay )
                    .catch( done );

                function onWallCreated( wall ) {
                    storedId = wall.getId();

                    return services.displayWall( storedId );
                }

                function onWallDisplay() {
                    queue.clearCalls();
                    application.startListening();

                    queue.once( 'board:added', onBoardAdded);

                    queue.trigger( 'board:create', { wall: storedId, name: storedName } );
                }

                function onBoardAdded( board ) {
                    should.exist( board );

                    board.should.respondTo( 'getId' );
                    board.should.respondTo( 'getName' );
                    board.getName().should.be.equal( storedName );
                    board.should.respondTo( 'getWall' );
                    board.getWall().should.be.equal( storedId );

                    var calls = queue.getCalls();

                    calls.length.should.be.above( 2 );

                    calls[0].event.should.be.equal( 'board:create' );
                    calls[1].event.should.be.equal( 'board:created' );
                    calls[2].event.should.be.equal( 'board:displayed' );
                    calls[3].event.should.be.equal( 'controls:enabled' );
                    calls[4].event.should.be.equal( 'board:added' );

                    done();
                }
            });

            it('When the wall has two cards already', function( done ) {
                var storedId, storedName = 'Two card board';

                application.pauseListenting();

                services
                    .createWall( { name: 'wall for new board' } )
                    .then( onWallCreated )
                    .then( onWallDisplay )
                    .then( onPocketCreated )
                    .then(function() {
                        queue.clearCalls();
                        application.startListening();

                        queue.once( 'board:displayed', onBoardDisplayed);

                        queue.once( 'cardlocation:created', onCardCreated);

                        queue.trigger( 'board:create', { wall: storedId, name: storedName } );
                    })
                    .catch( done );

                function onWallCreated( wall ) {
                    storedId = wall.getId();

                    return services.displayWall( storedId )
                        .then(function() {
                            return wall;
                        });
                }

                function onWallDisplay( wall ) {
                    return services.createPocket( { wall: storedId, title: 'First card' } )
                        .then(function() {
                            return wall;
                        });
                }

                function onPocketCreated( wall ) {
                    return services.createPocket( { wall: storedId, title: 'Second card' } )
                        .then(function() {
                            return wall;
                        });
                }

                function onBoardDisplayed( board ) {
                    should.exist( board );

                    board.should.respondTo( 'getId' );
                    board.should.respondTo( 'getName' );
                    board.getName().should.be.equal( storedName );
                    board.should.respondTo( 'getWall' );
                    board.getWall().should.be.equal( storedId );
                }

                function onCardCreated( card ) {
                    var calls = queue.getCalls();

                    calls.length.should.be.above( 7 );

                    calls[0].event.should.be.equal( 'board:create' );
                    calls[1].event.should.be.equal( 'board:created' );
                    calls[2].event.should.be.equal( 'board:displayed' );
                    calls[3].event.should.be.equal( 'controls:enabled' );
                    calls[4].event.should.be.equal( 'board:added' );
                    calls[5].event.should.be.equal( 'board:displayed' );
                    calls[6].event.should.be.equal( 'controls:enabled' );
                    calls[7].event.should.be.equal( 'cardlocation:created' );

                    done();
                }
            });

        });

    });

};
