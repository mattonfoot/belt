function EventQueue( options ) {
    this.options = options || {};

    this.events = {};
}

EventQueue.prototype.on = function( ev, reaction ) {
    if (!this.events[ev]) {
        this.events[ev] = [];
    }

    this.events[ev].push( reaction );

    return this;
};

EventQueue.prototype.emit = function( ev, data ) {
    if (this.events[ev]) {
        this.events[ev].forEach(function( react ) {
            react( data );
        });
    }

    return this;
};

EventQueue.prototype.clearAll = function() {
    this.events = {};
};

EventQueue.prototype.trigger = function( ev, data ) {
    this.emit( ev, data );
};

module.exports = EventQueue;
