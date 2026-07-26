// P5 safety-mode widget: deliberately no directory scan, no Skill body access,
// no follow-up message bridge, and no action controls.
(function () {
  const $ = (s) => document.querySelector(s);
  const message = '此 Codex widget 正处于 P5 安全模式：尚未接入技能管理中心统一库存，因此不会扫描目录、读取 Skill 正文或向会话发送命令。请在本地浏览器打开 SkillDeck 查看受治理的卡片墙。';

  function render() {
    $('#search').hidden = true;
    $('#cats').hidden = true;
    $('#count').textContent = '安全模式';
    $('#grid').innerHTML = '';
    $('#empty').style.display = 'block';
    $('#empty').textContent = message;
  }

  render();
})();
