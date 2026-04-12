import { createRouter, createWebHistory } from 'vue-router'
import FontConvert from '../components/FontConvert.vue'
import ImageConvert from '../components/ImageConvert.vue'
import GifToImage from '../components/GifToImage.vue'
import AboutInfo from '../components/AboutInfo.vue'
import Designer from '../components/Designer.vue'

const routes = [
  { path: '/', redirect: '/font-convert' },
  { path: '/font-convert', component: FontConvert },
  { path: '/image-convert', component: ImageConvert },
  { path: '/gif-to-image', component: GifToImage },
  { path: '/designer', component: Designer },
  { path: '/about-info', component: AboutInfo },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
