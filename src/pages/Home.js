import React from 'react';
import { useSelector } from 'react-redux';

const Home = () => {
  const count = useSelector((state) => state.counter.value);
  //const dispatch = useDispatch();

  return (
    <div>
      <h1>Home Page</h1>
      <p>Count: {count}</p>
     
    </div>
  );
};

export default Home;
