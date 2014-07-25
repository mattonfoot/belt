module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Board:Display', function() {

        describe('Triggering the selecting of a board', function() {
            var storedId, storedParentId, storedName = 'display board';

            it('Displays the chosen board', function(done) {
                application.pauseListenting();

                services
                    .createWall( { name: 'parent wall' } )
                    .then( onWallCreated )
                    .then( onWallSelected )
                    .then( onBoardCreated )
                    .then( onBoard3Created )
                    .catch( done );


                function onWallCreated( wall ) {
                    storedParentId = wall.getId();

                    return services.displayWall( storedParentId );
                }

                function onWallSelected( wall ) {
                    return services
                        .createBoard( { wall: storedParentId, name: 'board one' } );
                }

                function onBoardCreated( board ) {
                    return services
                        .createBoard( { wall: storedParentId, name: storedName } );
                }

                function onBoard3Created( board ) {
                    storedId = board.getId();
                    board.getName().should.be.equal( storedName );

                    queue.clearCalls();
                    application.startListening();

                    queue.once( 'board:displayed', onDisplayed);
                    queue.once( 'controls:enabled', onEnabled);

                    queue.trigger( 'board:display', storedId );
                }

                function onDisplayed( board ) {
                    should.exist( board );

                    board.should.respondTo( 'getId' );
                    board.getId().should.be.equal( storedId );
                    board.should.respondTo( 'getName' );
                    board.getName().should.be.equal( storedName );
                }

                function onEnabled() {
                    var calls = queue.getCalls();

                    calls.length.should.be.above( 2 );

                    calls[0].event.should.be.equal( 'board:display' );
                    calls[1].event.should.be.equal( 'board:displayed' );
                    calls[2].event.should.be.equal( 'controls:enabled' );

                    done();
                }
            });

        });

    });

};
