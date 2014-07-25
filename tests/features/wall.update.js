module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Wall:Update', function() {

        describe('Triggering the updating of a wall', function() {
            var storedId, storedName = 'unedited wall', newName = 'edited wall';

            it('Updates the chosen wall', function( done ) {
                application.pauseListenting();

                services
                    .createWall( { name: storedName } )
                    .then( onWallCreated )
                    .catch( done );

                function onWallCreated( wall ) {
                    storedId = wall.getId();
                    wall.getName().should.be.equal( storedName );

                    queue.clearCalls();
                    application.startListening();

                    queue.once( 'wall:updated', onWallUpdated);

                    wall.name = newName;

                    queue.trigger( 'wall:update', wall );
                }

                function onWallUpdated( wall ) {
                    should.exist( wall );

                    wall.should.respondTo( 'getId' );
                    wall.getId().should.be.equal( storedId );
                    wall.should.respondTo( 'getName' );
                    wall.getName().should.be.equal( newName );

                    var calls = queue.getCalls();

                    calls.length.should.be.equal( 2 );

                    calls[0].event.should.be.equal( 'wall:update' );
                    calls[1].event.should.be.equal( 'wall:updated' );

                    done();
                }
            });

        });

    });

};
