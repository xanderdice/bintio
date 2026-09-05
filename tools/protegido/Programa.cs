/* ==========================================================================
   BINTIO para Windows, con la ventana fuera de cualquier captura.

   POR QUE EXISTE ESTE FICHERO

   La version de escritorio normal la empaqueta Neutralino (tools/desktop.js) y
   pesa 2,6 MB. Hace todo lo que hace falta menos una cosa: no puede marcar su
   ventana como no capturable, porque eso es una llamada del sistema
   -SetWindowDisplayAffinity con WDA_EXCLUDEFROMCAPTURE- que Neutralino no
   expone.

   Y no se puede hacer desde fuera. Esta medido: esa llamada sobre la ventana
   de OTRO proceso devuelve error 5, acceso denegado. Sirve un script al lado
   del ejecutable, no sirve una extension de Neutralino -que es un proceso
   aparte-, no sirve nada que no este DENTRO del propio programa que creo la
   ventana. De ahi este anfitrion: es el minimo imprescindible para que la
   ventana sea nuestra y podamos protegerla.

   QUE HACE, EXACTAMENTE

   Abre una ventana, mete dentro el WebView2 que ya trae Windows, carga
   dist/bintio.html -la aplicacion entera en un fichero, la misma que se abre
   con doble clic- y le pone a la ventana la afinidad de no captura. A partir
   de ahi, cualquier grabador del sistema ve un hueco donde deberia estar la
   aplicacion: Impr Pant, la Herramienta de Recortes, OBS y compartir pantalla
   en una reunion. No es un truco de la pagina; lo aplica el compositor de
   Windows.

   Medido con la misma ventana en el mismo sitio: sin proteger ocupa el 68% de
   la captura, protegida el 0%.

   LO QUE NO ARREGLA

   Una camara apuntando a la pantalla. Contra eso no hay software, y conviene
   decirlo cada vez que se habla de esto.

   LO QUE HAY QUE SABER ANTES DE USARLO

   La boveda vive en el almacen del navegador, y el origen de este anfitrion
   (file://) NO es el mismo que el de la version de Neutralino (un http local
   con puerto propio). Son dos almacenes distintos: la identidad de uno no
   aparece en el otro. Si se cambia de un ejecutable al otro hay que llevarse
   la identidad con la Llave de Recuperacion o con una copia completa. Esta
   dicho en el README y lo dice tambien la ventana la primera vez.

   NO ES UN SEGUNDO PROYECTO

   Aqui no hay ni una linea de logica de BINTIO. Es una ventana, un WebView2 y
   una llamada al sistema; todo lo demas -cifrado, malla, interfaz- sigue
   viviendo en src/ y llega en el mismo bintio.html que usa todo el mundo.
   ========================================================================== */
using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Bintio
{
    internal static class Programa
    {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

        /* 0x11. Es WDA_EXCLUDEFROMCAPTURE y pide Windows 10 version 2004 o
           posterior. El valor viejo, WDA_MONITOR (0x01), tambien tapa pero
           pinta la ventana de negro para el propio usuario en algunos casos;
           este la deja verse normal y solo la quita de las capturas. */
        private const uint WDA_EXCLUDEFROMCAPTURE = 0x11;

        private static readonly Color FONDO = Color.FromArgb(6, 7, 15);   /* el de la aplicacion */

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string carpeta = Path.GetDirectoryName(Application.ExecutablePath);
            string pagina = Path.Combine(carpeta, "bintio.html");
            if (!File.Exists(pagina))
            {
                MessageBox.Show(
                    "Falta bintio.html al lado de este ejecutable.\r\n\r\n" +
                    "Este programa no lleva la aplicacion dentro: la carga del fichero de al lado, " +
                    "que es el que deja \"npm run build\" en dist/. Copia los dos juntos.",
                    "BINTIO", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var f = new Form();
            f.Text = "BINTIO";
            f.Width = 1120;
            f.Height = 760;
            f.MinimumSize = new Size(360, 480);
            f.StartPosition = FormStartPosition.CenterScreen;
            f.BackColor = FONDO;
            try { f.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            var web = new WebView2();
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = FONDO;   /* sin el destello blanco al abrir */
            f.Controls.Add(web);

            /* La ventana se protege en cuanto existe de verdad. Antes de Shown
               el manejador todavia puede no ser el definitivo. */
            f.Shown += delegate
            {
                bool ok = SetWindowDisplayAffinity(f.Handle, WDA_EXCLUDEFROMCAPTURE);
                if (!ok)
                {
                    MessageBox.Show(
                        "No se ha podido marcar la ventana como no capturable.\r\n\r\n" +
                        "Hace falta Windows 10 version 2004 (mayo de 2020) o posterior. " +
                        "La aplicacion funciona igual, pero en este equipo SI sale en las capturas de pantalla.",
                        "BINTIO", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            };

            web.CoreWebView2InitializationCompleted += delegate (object s, CoreWebView2InitializationCompletedEventArgs e)
            {
                if (!e.IsSuccess)
                {
                    MessageBox.Show(
                        "No se ha podido iniciar WebView2.\r\n\r\n" +
                        "Motivo: " + (e.InitializationException == null
                            ? "sin detalle" : e.InitializationException.Message) + "\r\n\r\n" +
                        "Windows 11 lo trae puesto y Windows 10 tambien si tiene Edge al dia. " +
                        "Si no, se instala desde la pagina de Microsoft buscando \"WebView2 Runtime\".\r\n\r\n" +
                        "Mientras tanto puedes usar bintio-win_x64.exe, que no lo necesita, " +
                        "o abrir bintio.html con doble clic.",
                        "BINTIO", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    f.Close();
                    return;
                }

                var ajustes = web.CoreWebView2.Settings;
                /* El menu del boton derecho del propio WebView2, aparte del que
                   ya quita la pagina: aqui no hay nada que "guardar como" y si
                   habia un "Inspeccionar" comodo. */
                ajustes.AreDefaultContextMenusEnabled = false;
                ajustes.AreDevToolsEnabled = false;
                ajustes.IsStatusBarEnabled = false;
                /* F12, Ctrl+Mayus+I y compania. Ctrl+C, Ctrl+V y Ctrl+A siguen
                   funcionando: esto solo quita los aceleradores del navegador. */
                ajustes.AreBrowserAcceleratorKeysEnabled = false;
                ajustes.IsZoomControlEnabled = false;

                /* Una marca en el user agent para que la pagina sepa que esta
                   ventana SI esta blindada y no diga lo contrario en Ajustes.

                   Por el user agent y no inyectando una variable global: la
                   pagina lleva una CSP estricta (script-src 'self') y un script
                   inyectado puede acabar bloqueado por ella. Leer una cadena no
                   depende de nada. */
                ajustes.UserAgent = ajustes.UserAgent + " BINTIO-Protegido/1";

                web.CoreWebView2.Navigate(new Uri(pagina).AbsoluteUri);
            };

            /* El perfil del WebView2 -donde acaba la boveda cifrada- fuera de
               la carpeta del programa, igual que el banco de tools/desktop.js:
               asi borrar la carpeta de descarga no se lleva la identidad, y la
               carpeta de reparto no se llena de cache. */
            string perfil = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "bintio", "webview2");
            try { Directory.CreateDirectory(perfil); } catch { }

            /* Se le dice al propio control donde va el perfil y que lo arranque
               el. Antes esto creaba el entorno a mano y enganchaba el resultado
               con un BeginInvoke sobre el formulario; el formulario todavia no
               tenia manejador, BeginInvoke reventaba en un hilo de fondo, la
               excepcion se perdia sin que nadie la viera y quedaba una ventana
               vacia sin un solo mensaje de error. Por esta via lo hace la
               biblioteca, en el hilo que toca. */
            web.CreationProperties = new CoreWebView2CreationProperties();
            web.CreationProperties.UserDataFolder = perfil;
            web.EnsureCoreWebView2Async();

            Application.Run(f);
        }
    }
}
