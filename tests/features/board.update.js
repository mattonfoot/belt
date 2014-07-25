module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Board:Update', function() {

        describe('Triggering the updating of a board', function() {
            var storedId, storedParentId, storedName = 'unedited board', newName = 'edited board';

            it('Updates the chosen board', function( done ) {
                application.pauseListenting();

                services
                    .createWall( { name: 'parent wall' } )
                    .then( onWallCreated )
                    .then( onBoardCreated )
                    .catch( done );


                function onWallCreated( wall ) {
                    storedParentId = wall.getId();

                    return services
                        .createBoard( { wall: storedParentId, name: storedName } );
                }

                function onBoardCreated( board ) {
                    storedId = board.getId();
                    board.getName().should.be.equal( storedName );

                    queue.clearCalls();
                    application.startListening();

                    queue.once( 'board:updated', onBoardUpdated);

                    board.name = newName;

                    queue.trigger( 'board:update', board );
                }

                function onBoardUpdated( board ) {
                    should.exist( board );

                    board.should.respondTo( 'getId' );
                    board.getId().should.be.equal( storedId );
                    board.should.respondTo( 'getName' );
                    board.getName().should.be.equal( newName );

                    var calls = queue.getCalls();

                    calls.length.should.be.equal( 2 );

                    calls[0].event.should.be.equal( 'board:update' );
                    calls[1].event.should.be.equal( 'board:updated' );

                    done();
                }
            });

        });
        
    });

};
