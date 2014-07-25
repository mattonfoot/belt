module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Wall:New', function() {

        describe('Triggering the wall creator', function() {

            it('Displays a wall creator to capture new wall details', function(done) {
                queue.once( 'wallcreator:displayed', onWallCreateDisplayed);

                queue.trigger( 'wall:new' );

                function onWallCreateDisplayed( data ) {
                    should.not.exist( data );

                    var calls = queue.getCalls();

                    calls.length.should.be.equal( 2 );

                    calls[0].event.should.be.equal( 'wall:new' );
                    calls[1].event.should.be.equal( 'wallcreator:displayed' );

                    done();
                }
            });

        });
        
    });

};
