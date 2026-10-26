import {defineConfig} from 'vite';
export default defineConfig({base:'/learn/',server:{host:'127.0.0.1',port:5174,proxy:{'/learn/api':'http://127.0.0.1:4318','/learn/media':'http://127.0.0.1:4318'}},build:{outDir:'dist',emptyOutDir:true}});
