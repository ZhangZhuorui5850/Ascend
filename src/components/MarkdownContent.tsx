import type { CSSProperties, ReactNode } from "react";
import { MathTex } from "@/components/RichText";
import { parseMarkdown, type Align, type BlockNode, type InlineNode } from "@/lib/markdown";

/**
 * 共享 Markdown 渲染：解析交给 @/lib/markdown（KaTeX 按需加载），
 * 组件只负责 AST → React。样式使用 globals 的 md* 类。
 */
export function MarkdownContent({ source }: { source: string }) {
  return <div className="mdView">{renderBlocks(parseMarkdown(source), "md")}</div>;
}

function renderBlocks(blocks: BlockNode[], keyPrefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (block.kind) {
      case "heading": {
        // 文档 h1 降级为 h2，避免和预览窗标题抢层级
        const Tag = (`h${Math.min(block.level + 1, 6)}`) as "h2";
        return <Tag key={key}>{renderInlineNodes(block.inline, key)}</Tag>;
      }
      case "codeBlock":
        return (
          <pre className="mdCode" key={key}>
            <code>{block.text}</code>
          </pre>
        );
      case "mathBlock":
        return <MathTex display key={key} tex={block.tex} />;
      case "hr":
        return <hr key={key} />;
      case "blockquote":
        return <blockquote key={key}>{renderBlocks(block.children, key)}</blockquote>;
      case "list": {
        const items = block.items.map((item, itemIndex) => {
          const itemKey = `${key}-${itemIndex}`;
          return (
            <li className={item.checked !== null ? "mdTask" : undefined} key={itemKey}>
              {item.checked !== null ? <input checked={item.checked} disabled readOnly type="checkbox" /> : null}
              {renderInlineNodes(item.inline, itemKey)}
              {renderBlocks(item.children, itemKey)}
            </li>
          );
        });
        return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
      }
      case "table":
        return (
          <div className="mdTableWrap" key={key}>
            <table className="mdTable">
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex} style={alignStyle(block.align[cellIndex])}>
                      {renderInlineNodes(cell, `${key}-h${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} style={alignStyle(block.align[cellIndex])}>
                        {renderInlineNodes(cell, `${key}-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "paragraph":
        return <p key={key}>{renderInlineNodes(block.inline, key)}</p>;
    }
  });
}

function alignStyle(align: Align): CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}

function renderInlineNodes(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case "text":
        return node.text;
      case "code":
        return <code key={key}>{node.text}</code>;
      case "mathInline":
        return <MathTex display={false} key={key} tex={node.tex} />;
      case "strong":
        return <strong key={key}>{renderInlineNodes(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderInlineNodes(node.children, key)}</em>;
      case "del":
        return <del key={key}>{renderInlineNodes(node.children, key)}</del>;
      case "link":
        return node.safe ? (
          <a href={node.href} key={key} rel="noopener noreferrer" target="_blank">
            {node.label}
          </a>
        ) : (
          <span key={key}>{node.label}</span>
        );
    }
  });
}
