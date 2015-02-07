var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
  res.sendFile('clients/player.html', {'root': '../'});
  io.on('connection', function(socket){
    socket.on('join', function(name){
      //Tell game that a player joined
    });
    socket.on('play', function(id){
      //Tell game that a card was played
    });
    socket.on('czarFlip', function(id){
      //Tell game that the czar flipped a card
    });
    socket.on('disconnect', function(){
      //Tell game that the player left
    });
  });
});

app.get('/display', function(req, res){
  res.sendFile('clients/display.html', {'root': '../'});
  io.on('connection', function(socket){
    //Tell the game a display joined
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});
