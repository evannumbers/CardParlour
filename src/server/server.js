var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var path = require('path');

function CAH() {
  this.players = {};
  this.white_deck = [];
  this.black_deck = [];
  this.white_graveyard = [];
  this.black_graveyard = [];

  function Card(id, text) {
    this.id = id;
    this.text = text;
  }

  function Player(name, socket) {
    this.name = name;
    this.socket = socket;
    this.hand = [];
    this.score = 0;
  }

  this.getCards = function() {
    var filePath = path.join(__dirname, '../server/cah/cards/box.txt');
    var self = this;
    fs.readFile(filePath, {encoding: 'utf-8'}, function(err, data){
      if (!err){
        data = data.split("\n");
        for(var i in data) {
          var line = data[i];
          var elements = line.split("|");

          var type = elements[0];
          var numCards = elements[1];
          var desc = elements[2];

          if(numCards > 1) {
            continue;
          }

          var newCard = new Card(i, desc);
          if(type == 'W') {
            self.white_deck.push(newCard);
          } else {
            self.black_deck.push(newCard);
          }
        }
      } else {
          console.log(err);
      }
    });
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
cah.getCards();

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
