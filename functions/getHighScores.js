const getHighScores = async () => {
    try {
      const response = await fetch(
        'https://api.cloudflare.com/client/v4/accounts/3e62ac953a722db41c79f9e3a36e4dbd/storage/kv/namespaces/a9ad3f4232964351ba73f8560ca01e5a/keys',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer 07auqbr7vq14anb2kUmp1jAQk0H3lS1OpaaUNv1Y',
            'Content-Type': 'application/json'
          }
        }
      );
  
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
  
      const data = await response.json();
      console.log(data);
      // 处理返回的数据，可能需要更新状态
    } catch (error) {
      console.error('There has been a problem with your fetch operation:', error);
    }
  };
  
  // 在组件中适当的地方调用这个函数，例如在游戏开始时
  useEffect(() => {
    if (gameStarted) {
      getHighScores();
    }
  }, [gameStarted]);