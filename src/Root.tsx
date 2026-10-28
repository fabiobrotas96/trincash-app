import { useEffect, useState, type ComponentType } from 'react';
import { View } from 'react-native';
import { carregarConfig, resolverTema, type Config } from './services/config';
import { aplicarTema, colors } from './theme';
import { definirOcultarValores } from './utils/format';

type AppComponent = ComponentType<{ configInicial: Config }>;

/**
 * Ponto de entrada: lê as preferências, aplica o tema e só então carrega o
 * App. As telas criam seus estilos (StyleSheet.create) quando o módulo é
 * avaliado, então a paleta precisa estar definida antes do require('../App').
 */
export default function Root() {
  const [estado, setEstado] = useState<{ App: AppComponent; config: Config } | null>(null);

  useEffect(() => {
    carregarConfig().then((config) => {
      aplicarTema(resolverTema(config.tema));
      definirOcultarValores(config.ocultarValores);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const App = (require('../App') as { default: AppComponent }).default;
      setEstado({ App, config });
    });
  }, []);

  if (!estado) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const { App, config } = estado;
  return <App configInicial={config} />;
}
