var util = require('util')
  , Queue = require('./queue');

function TestQueue( options ) {
    Queue.call( this, options );
}

util.inherits( TestQueue, Queue );

TestQueue.prototype._emit = TestQueue.prototype.emit;
TestQueue.prototype.emit = function( ev, data ) {
    this._calls = this._calls || [];

    this._calls.push({ event: ev, data: data });

    this._emit( ev, data );
};

TestQueue.prototype.clearCalls = function() {
    this._calls = [];

    for (var ev in this.events) {
        clearOnceEvents( this, ev );
    }

    function clearOnceEvents( _this, ev ) {
        var cleansed = [];

        _this.events[ev].forEach(function( react ) {
            if (!react.once) {
                cleansed.push( react );
            }
        });

        _this.events[ev] = cleansed;
    }
};

TestQueue.prototype.getCalls = function() {
    return this._calls;
};

module.exports = TestQueue;
