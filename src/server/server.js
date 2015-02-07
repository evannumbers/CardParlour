var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

function CAH() {
  this.players = {};
  this.deck = [];
  this.graveyard = [];

  function Card(id, text) {
    self.id = id;
    self.text = text;
  }

  function Player(name, socket) {
    this.name = name;
    this.socket = socket;
    this.hand = [];
    this.score = 0;
  }

  /*Begin socket output functions*/
  this.sendState = function(socket, state) {
    socket.emit('update state', state);
  };

  this.sendRemoveCard = function(socket, id) {
    socket.emit('remove card', id);
  }

  this.sendAddPlayer = function(socket, name) {
    socket.emit('add player', name);
  };

  this.sendSetPlayerScore = function(socket, name, score) {
    socket.emit('set player score', (name, score));
  };

  this.sendRemovePlayer = function(socket, name) {
    socket.emit('remove player', name);
  };

  this.sendSetBCard = function(socket, id, text) {
    socket.emit('set bcard', (id, text));
  };

  this.sendAddWCard = function(socket, id, text) {
    socket.emit('add wcard', (id, text));
  };

  this.sendFlipWCard = function(socket, id) {
    socket.emit('flip wcard', id);
  };

  this.sendClearCards = function(socket) {
    socket.emit('clear cards', 0);
  };

  this.sendSetQR = function(socket, url) {
    socket.emit('set qr', url);
  };
  /*End socket output functions*/

  this.addPlayer = function(name, socket) {
    player = new Player(name, socket);
    this.players[socket] = player;
    this.sendState(socket), 0);
    console.log("Player added");
  };

  this.addDisplay = function(socket) {
    for(var sock in this.players) {
      this.sendAddPlayer(socket, this.players[sock].name);
      this.sendSetPlayerScore(socket, this.players[sock].name,
        this.players[sock].score);
    }
    //TODO: send QR
    //TODO: Send black card
    //TODO: Send white cards on the table, face up
  };
}

var cah = new CAH();

app.use('/style', express.static('../style'));
app.get('/', function(req, res){
  res.sendFile('clients/player.html', {'root': '../'});

});

app.get('/display', function(req, res){
  res.sendFile('clients/display.html', {'root': '../'});
});

io.on('connection', function(socket){
  console.log("client connected");
  socket.on('join', function(name){
    //Tell game that a player joined
    cah.addPlayer(name, socket);
  });
  socket.on('play', function(id){
    //Tell game that a card was played
  });
  socket.on('czar flip', function(id){
    //Tell game that the czar flipped a card
  });
  socket.on('disconnect', function(){
    //Tell game that the player/display left
    console.log("client disconnected");
  });
  socket.on('register display', function(){
    //Tell the game a display has joined
    cah.addDisplay(socket);
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});
