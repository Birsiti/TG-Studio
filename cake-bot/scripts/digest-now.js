// Ручной прогон утренней сводки — проверить настройку, не дожидаясь утра.
// npm run digest:now            — отправить руководителям
// npm run digest:now -- --print — только показать текст в терминале
const { runDigestJob, buildDigest } = require('../src/digest-job');

(async () => {
  if (process.argv.includes('--print')) console.log(await buildDigest());
  else await runDigestJob();
})().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
