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
  this.sendState = function(player, state) {
    player.socket.emit('update state', state);
  };

  this.sendAddPlayer = function(player) {

  };
  /*End socket output functions*/

  this.addPlayer = function(name, socket) {
    player = new Player(name, socket);
    this.players[socket] = player;
    this.sendState(player, 0);
    console.log("Player added");
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
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});
