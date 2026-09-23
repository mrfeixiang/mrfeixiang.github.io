importScripts('./optimizer.js');
self.onmessage = ({data}) => {
  try {self.postMessage({result:self.SyFlow.optimize(data)});}
  catch(error) {self.postMessage({error:error.message});}
};
