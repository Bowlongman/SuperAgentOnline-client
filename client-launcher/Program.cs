using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SuperAgentOnline.Client
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length == 1 && args[0] == "/self-test") return SelfTest();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new Launcher());
            return 0;
        }

        internal static bool TryNormalizeHost(string input, out string origin)
        {
            origin = null;
            if (String.IsNullOrWhiteSpace(input)) return false;
            string value = input.Trim();
            foreach (char character in value)
            {
                if (Char.IsControl(character) || Char.IsWhiteSpace(character) || character == '"' || character == '\\') return false;
            }
            Uri uri;
            if (!Uri.TryCreate(value, UriKind.Absolute, out uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;
            if (String.IsNullOrEmpty(uri.Host) || uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0) return false;
            if (uri.AbsolutePath != "/") return false;
            if (uri.HostNameType != UriHostNameType.Dns && uri.HostNameType != UriHostNameType.IPv4 && uri.HostNameType != UriHostNameType.IPv6) return false;
            origin = uri.GetLeftPart(UriPartial.Authority) + "/";
            return true;
        }

        private static int SelfTest()
        {
            string result;
            string[] accepted = { "http://127.0.0.1:18974", "https://example.com/", "http://[::1]:18974/", " HTTPS://example.com:443/ " };
            foreach (string value in accepted)
            {
                if (!TryNormalizeHost(value, out result) || !result.EndsWith("/")) return 1;
            }
            string[] rejected = { "", "file:///C:/Windows", "javascript:alert(1)", "example.com", "http://user:password@example.com", "https://example.com/portal", "https://example.com/?command=hello", "https://example.com/#world", "http://127.0.0.1:99999/", "https://example.com\" --other-flag", "https://example.com\\path", "http://example.com/\n--flag", "https://example.com test" };
            foreach (string value in rejected)
            {
                if (TryNormalizeHost(value, out result)) return 2;
            }
            if (!TryNormalizeHost("http://127.0.0.1:18974", out result) || result != "http://127.0.0.1:18974/") return 3;
            return 0;
        }
    }

    internal sealed class Launcher : Form
    {
        private readonly TextBox host = new TextBox();
        private readonly Button connect = new Button();
        private readonly Label status = new Label();

        internal Launcher()
        {
            Text = "Super Agent Online · 游戏客户端";
            ClientSize = new Size(620, 320);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Microsoft YaHei UI", 10F);
            BackColor = Color.FromArgb(20, 27, 39);
            ForeColor = Color.FromArgb(230, 237, 245);

            Label title = new Label { Text = "SUPER AGENT ONLINE", Location = new Point(30, 25), Size = new Size(560, 35), Font = new Font("Segoe UI", 20F, FontStyle.Bold) };
            Label description = new Label { Text = "连接主机，在独立 Microsoft Edge 窗口中进入 Web 游戏。", Location = new Point(32, 76), Size = new Size(560, 26) };
            Label hostLabel = new Label { Text = "主机地址（http 或 https）", Location = new Point(32, 122), Size = new Size(540, 24) };
            host.Text = "https://superagentonline.com";
            host.SetBounds(32, 153, 415, 30);
            connect.Text = "连接游戏";
            connect.SetBounds(459, 151, 125, 34);
            connect.BackColor = Color.FromArgb(62, 140, 174);
            connect.ForeColor = Color.White;
            connect.FlatStyle = FlatStyle.Flat;
            connect.Click += async delegate { await Connect(); };
            status.Text = "可直接连接默认世界，也可输入其他运行中主机的地址。";
            status.SetBounds(32, 207, 552, 50);
            Label footer = new Label { Text = "需要网络连接、.NET Framework 4.5+ 和 Microsoft Edge。", Location = new Point(32, 277), Size = new Size(552, 24), ForeColor = Color.FromArgb(164, 180, 196) };
            Controls.AddRange(new Control[] { title, description, hostLabel, host, connect, status, footer });
            AcceptButton = connect;
        }

        private async Task Connect()
        {
            string origin;
            if (!Program.TryNormalizeHost(host.Text, out origin))
            {
                status.Text = "地址无效。请输入 http://主机:端口 或 https://主机，去掉账号、路径和查询参数。";
                return;
            }
            string edge = FindEdge();
            if (edge == null)
            {
                status.Text = "未找到 Microsoft Edge。请先安装 Edge，然后重新打开客户端。";
                return;
            }
            connect.Enabled = false;
            host.Enabled = false;
            status.Text = "正在连接 " + origin;
            try
            {
                string gameUrl = origin + "game";
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                using (HttpClientHandler handler = new HttpClientHandler { AllowAutoRedirect = false })
                using (HttpClient client = new HttpClient(handler))
                {
                    client.Timeout = TimeSpan.FromSeconds(6);
                    HttpStatusCode statusCode = await CheckPage(client, gameUrl);
                    if (statusCode == HttpStatusCode.NotFound)
                    {
                        gameUrl = origin;
                        statusCode = await CheckPage(client, gameUrl);
                    }
                    if ((int)statusCode < 200 || (int)statusCode >= 300)
                    {
                        status.Text = "主机返回 HTTP " + (int)statusCode + "。请确认游戏地址与主机运行状态。";
                        return;
                    }
                }
                Process.Start(new ProcessStartInfo {
                    FileName = edge,
                    Arguments = "--app=\"" + gameUrl + "\"",
                    UseShellExecute = false,
                    WorkingDirectory = Path.GetDirectoryName(edge)
                });
                status.Text = "已打开游戏窗口。可在这里更换主机地址后再次连接。";
            }
            catch (TaskCanceledException)
            {
                status.Text = "连接超时。请确认主机已启动、地址正确且网络可达，然后重试。";
            }
            catch (HttpRequestException)
            {
                status.Text = "无法连接主机。请检查主机运行状态、网络连接及 HTTPS 证书。";
            }
            catch (Exception)
            {
                status.Text = "无法打开游戏窗口。请确认 Microsoft Edge 可以正常运行后重试。";
            }
            finally
            {
                connect.Enabled = true;
                host.Enabled = true;
            }
        }

        private static async Task<HttpStatusCode> CheckPage(HttpClient client, string url)
        {
            using (HttpResponseMessage response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead))
            {
                return response.StatusCode;
            }
        }

        private static string FindEdge()
        {
            string[] directories = {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            };
            foreach (string directory in directories)
            {
                if (String.IsNullOrEmpty(directory)) continue;
                string path = Path.Combine(directory, "Microsoft", "Edge", "Application", "msedge.exe");
                if (File.Exists(path)) return path;
            }
            return null;
        }
    }
}
