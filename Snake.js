function init(){
	var canvas = document.getElementById('mycanvas');
	w=canvas.width=700;
	h=canvas.height=600;
	pen = canvas.getContext('2d');
	cs = 50;
	food = getRandomFood();
	game_over = false;
	score = 3;

	food_img = new Image();
	food_img.src = "Assets/apple.png";

	snake_img = new Image();
	snake_img.src = "Assets/snakebody.jpeg";

	trophy_img = new Image();
	trophy_img.src = "Assets/trophy.png";

	name = "Shashank Yadav";
	game = "Snake Game";

	snake = {
		init_len:3,
		//color:"brown",
		cells:[],
		direction:"right",

		createSnake:function(){
			for(var i=this.init_len;i>0;i--){
				this.cells.push({x:i,y:1});
			}
		},

		drawSnake:function(){
			for(var i=0;i<this.cells.length;i++){
				//pen.fillStyle = this.color;
				pen.drawImage(snake_img,this.cells[i].x*cs+3,this.cells[i].y*cs+3,cs-6,cs-6);
			}
		},

		updateSnake:function(){
			//console.log("Updating Snake according to direction.");
			
			var headX = this.cells[0].x;
			var headY = this.cells[0].y;

			if(headX==food.x && headY==food.y)
			{
				food=getRandomFood();
				score++;
			}
			else
				this.cells.pop();
			
			if(this.direction=="right")
			{
				var X = headX + 1;
				var Y = headY;
			}
			else if(this.direction=="left")
			{
				var X = headX - 1;
				var Y = headY;
			}
			else if(this.direction=="up")
			{
				var X = headX;
				var Y = headY - 1;
			}
			else
			{
				var X = headX;
				var Y = headY + 1;
			}
			this.cells.unshift({x:X,y:Y});

			var last_x = Math.round((w/cs)-2);
			var last_y = Math.round((h/cs)-2);

			if(this.cells[0].x<1 || this.cells[0].y<1 || this.cells[0].x>last_x || this.cells[0].y>last_y)
				game_over = true;
		}

	};

	snake.createSnake();

	function keyPressed(e){
		//console.log("Key Pressed :",e.key);
		if(e.key=="ArrowRight")
			snake.direction = "right";
		else if(e.key=="ArrowLeft")
			snake.direction = "left";
		else if(e.key=="ArrowDown")
			snake.direction = "down";
		else
			snake.direction = "up";
		console.log(snake.direction);
	}

	document.addEventListener('keydown',keyPressed);

}

function draw(){
	pen.clearRect(0,0,w,h);
	snake.drawSnake();

	//pen.fillStyle = food.color;
	pen.drawImage(food_img,food.x*cs-5,food.y*cs-5,cs+10,cs+10);

	pen.drawImage(trophy_img,-10,0,cs+30,2*cs);
	pen.fillStyle = "black";
	pen.font = "20px Cursive";
	pen.fillText(score,25,40);

	pen.fillStyle = "Gold";
	pen.font = "30px Cursive";
	pen.fillText(game,300,40);
	pen.font = "25px Cursive";
	pen.fillText(name,300,580);
}

function update(){
	snake.updateSnake();
}

function getRandomFood(){
	var foodX = Math.round(Math.random()*(w-cs)/cs);
	var foodY = Math.round(Math.random()*(h-cs)/cs);
	if(foodX==0 || foodX==13)
		foodX=5;
	if(foodY==0 || foodY==11)
		foodY=5;
	/*for(var i=0;i<snake.cells.length;i++)
	{
		if(foodX==snake.cells[i].x && foodY==snake.cells[i].y)
		{
			return getRandomFood();
		}
	}*/
	var food = {
		x:foodX,
		y:foodY,
		//color:"red",
	}
	return food;
}

function gameloop(){
	if(game_over==true)
	{
		clearInterval(f);
		alert("Game Over");
		return;
	}
	draw();
	update();
}

init();

var f = setInterval(gameloop,100);