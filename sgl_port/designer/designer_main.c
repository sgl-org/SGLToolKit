/* designer/designer_main.c
 *
 * Entry point of the UI designer simulation build.
 * The designer generates designer_ui.c which implements
 * sgl_designer_ui_create(); this file only drives the SDL window.
 */

#include <SDL.h>
#include <sgl.h>

typedef struct sgl_port_sdl2 sgl_port_sdl2_t;

sgl_port_sdl2_t *sgl_port_sdl2_init(void);
void sgl_port_sdl2_present(void);
void sgl_port_sdl2_deinit(sgl_port_sdl2_t *sdl2_dev);

/* implemented by the generated designer_ui.c */
void sgl_designer_ui_create(sgl_obj_t *parent);

int main(int argc, char *argv[])
{
    SGL_UNUSED(argc);
    SGL_UNUSED(argv);

    sgl_port_sdl2_t *dev = sgl_port_sdl2_init();
    if (dev == NULL) {
        return -1;
    }

    sgl_designer_ui_create(NULL);

    bool quit = false;
    while (!quit) {
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) {
                quit = true;
            }
            else if (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE) {
                quit = true;
            }
        }

        sgl_task_handler();
        sgl_port_sdl2_present();
        SDL_Delay(1);
    }

    sgl_port_sdl2_deinit(dev);
    return 0;
}
